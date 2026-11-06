---
id: t01
slug: number-systems
title: Number Systems and Data Representation
tier: 1
prerequisites: []
estimatedMinutes: 45
learningObjectives:
  - Convert values between binary, decimal, and hexadecimal
  - Encode and decode signed integers in two's complement
  - Explain why floating-point arithmetic is approximate
  - Predict how multi-byte values are laid out in memory
  - Encode Unicode code points as UTF-8 bytes
version: 1
---

## Why this matters

Every value in a program, whether a number, a character, or a pixel, is stored as a pattern of bits. Bugs like integer overflow, `0.1 + 0.2 != 0.3`, garbled text such as "Ã©", and corrupted network data all come from misunderstanding how those patterns are interpreted. Knowing the representation lets you predict these bugs instead of being surprised by them.

Assumptions for this lesson unless stated otherwise: C11 or later, GCC or Clang, a little-endian x86-64 or ARM64 machine, IEEE 754 floating point, and UTF-8 source files and strings.

## Bits, Bytes, and Number Bases

### Intuition

A **bit** is a single switch that is either 0 or 1. A **byte** is a group of 8 bits. With n bits you can form 2^n different patterns, so a byte has 256 patterns.

A number base is just a way of writing a value down. In base 10 each position is worth 10 times the one to its right; in base 2 (binary) each position is worth 2 times; in base 16 (hexadecimal, "hex") each is worth 16 times.

### How it works

A digit string d(k)...d(1)d(0) in base b has the value d(k)·b^k + ... + d(1)·b + d(0).

To convert decimal to binary, divide by 2 repeatedly and read the remainders from last to first. Hex uses the digits 0–9 and A–F (A = 10, ..., F = 15). Each hex digit maps to exactly 4 bits (a **nibble**), so you convert between binary and hex by grouping bits in fours from the right.

```text
decimal 181 -> binary
181/2=90 r1   90/2=45 r0   45/2=22 r1
22/2=11  r0   11/2=5  r1    5/2=2  r1
 2/2=1   r0    1/2=0  r1
read upward:   1011 0101
hex:              B    5   -> 0xB5
check: 128+32+16+4+1 = 181
```

With n bits, unsigned values run from 0 to 2^n − 1. A byte holds 0 to 255, not 0 to 256.

### Example

```c
#include <stdio.h>

int main(void) {
    unsigned x = 0xB5;      // hex literal
    printf("%u\n", x);      // 181
    printf("%X\n", x);      // B5
    printf("%o\n", x);      // 265 (octal)
    return 0;
}
```

### Under the hood

Memory is a long array of bytes, each with an address. The CPU never stores "a hex number" or "a decimal number". It stores bits, and decimal or hex is only how a human or `printf` chooses to write them.

The **type** decides how bits are interpreted. The single byte 0xB5 means 181 as an `unsigned char` but −75 as a `signed char`, as the next section explains.

> Key idea: hex is popular because it is a compact, exact view of bits. Two hex digits are always one byte.

### Pitfalls

- In C, a leading zero makes a literal octal: `010` is 8, not 10.
- Off-by-one on ranges: n bits give a maximum unsigned value of 2^n − 1.
- Bits vs bytes: network speeds are usually in bits per second, file sizes in bytes, a factor of 8 apart.

## Two's Complement

### Intuition

Picture a car odometer at 000. Roll it back one step and it shows 999. In 8-bit binary, rolling back from 00000000 gives 11111111, and two's complement simply agrees to call that pattern −1.

Precisely: in n-bit two's complement, the top bit has weight −2^(n−1) instead of +2^(n−1). Every other bit keeps its usual positive weight.

### How it works

- Value = −b(n−1)·2^(n−1) + the sum of the other bits' normal weights.
- Range: −2^(n−1) to 2^(n−1) − 1. For 8 bits that is −128 to 127. There is one more negative value than positive.
- To negate a value, invert every bit and add 1.
- To read a pattern whose top bit is 1, take its unsigned value and subtract 2^n.

```text
-20 in 8 bits
+20         0001 0100
invert      1110 1011
add 1       1110 1100   = 0xEC
check: 0xEC = 236, 236 - 256 = -20
```

Two's complement won over alternatives because the same adder circuit works for signed and unsigned numbers, and there is only one zero. **Sign-magnitude** (top bit is the sign, the rest is the size) and **ones' complement** (negate by inverting only) both have a +0 and a −0.

### Example

```c
#include <stdio.h>
#include <stdint.h>

int main(void) {
    int8_t a = -20;
    uint8_t bits = (uint8_t)a; // same 8 bits
    printf("%d\n", bits);      // 236
    uint8_t u = 250;
    u = u + 10;                // wraps mod 256
    printf("%d\n", u);         // 4
    return 0;
}
```

### Under the hood

The CPU's add instruction does not know whether its inputs are signed. It produces the same bits either way and sets flags: the **carry flag** signals unsigned overflow, and the **overflow flag** signals signed overflow. The compiler picks signed or unsigned comparison instructions based on your types.

**Sign extension**: when a signed value is widened, the top bit is copied into the new high bits, so 8-bit 1110 1100 becomes 16-bit 1111 1111 1110 1100, still −20. Unsigned values are **zero-extended** instead (new high bits are 0).

In C, unsigned arithmetic is defined to wrap modulo 2^n. Signed overflow is **undefined behavior**: the hardware would wrap, but the compiler may assume it never happens and optimize on that basis, for example treating `x + 1 > x` as always true. Since C23 the standard requires two's complement representation, but signed overflow is still undefined.

> Watch out: when a signed and an unsigned int meet in one expression, C converts the signed one to unsigned. So `-1 < 0u` is false: −1 becomes the largest unsigned value.

### Pitfalls

- Negating the most negative value overflows: in 8 bits, −(−128) would be 128, which does not fit.
- An unsigned value never goes below zero. Subtracting past zero wraps to a very large number.
- Converting an out-of-range value to a signed type is implementation-defined in C. GCC and Clang wrap it modulo 2^n.

## Floating Point

### Intuition

Floating point is scientific notation in base 2: instead of 6.25 = 6.25 × 10^0, store 1.1001 × 2^2. A fixed number of bits holds the significant digits, so precision is limited. The gaps between representable numbers grow as numbers get larger.

### How it works

IEEE 754 formats store three fields:

| Format | Sign | Exponent | Fraction |
|---|---|---|---|
| float (binary32) | 1 | 8, bias 127 | 23 |
| double (binary64) | 1 | 11, bias 1023 | 52 |

For normal numbers the value is (−1)^sign × 1.fraction × 2^(exponent − bias). The leading 1 is implicit and not stored. Each operation rounds its exact result to the nearest representable value (ties go to even, the default mode).

Special patterns: an all-zero exponent encodes zero and tiny **subnormal** numbers. An all-ones exponent encodes infinity (fraction 0) or **NaN**, "not a number" (fraction nonzero).

```text
-6.25 as float
6.25 = 110.01b = 1.1001b x 2^2
sign 1   exponent 2+127 = 129 = 1000 0001
fraction 1001 000...0 (23 bits)
1 10000001 10010000000000000000000
= 0xC0C80000
```

A double carries about 15–17 significant decimal digits, a float about 6–9. Every integer with magnitude up to 2^53 is exactly representable as a double; beyond that, the gap between neighbors exceeds 1.

### Example

```c
#include <stdio.h>

int main(void) {
    double a = 0.1 + 0.2;
    printf("%.17g\n", a);       // 0.30000000000000004
    printf("%d\n", a == 0.3);   // 0
    float f = 16777216.0f;      // 2^24
    printf("%.1f\n", f + 1.0f); // 16777216.0
    return 0;
}
```

0.1 in binary is 0.000110011001100... repeating forever, just as 1/3 repeats in decimal. It must be rounded, and so must 0.2 and 0.3. The rounded sum lands on a different double than the rounded 0.3. The float line assumes `FLT_EVAL_METHOD` is 0, true on x86-64 and ARM64: 2^24 + 1 needs 25 significant bits, so it rounds back to 2^24.

### Under the hood

Modern CPUs do floating-point math in dedicated registers and units (SSE/AVX on x86-64, NEON on ARM64). Rounding happens after every operation, so (a + b) + c and a + (b + c) can give different results: floating-point addition is not associative. That is why compilers will not reorder float math unless you opt in with flags like `-ffast-math`.

NaN compares unequal to everything, including itself, so `x != x` is true exactly when x is NaN. Also, −0.0 == 0.0 is true even though their bits differ.

### Pitfalls

- Comparing computed results with `==`. Compare with a tolerance suited to the magnitudes involved.
- Storing money in floats. Use integer cents or a decimal type.
- Large integers in doubles: IDs above 2^53 silently round. JavaScript numbers are doubles, so this bites JSON APIs.
- Assuming more exponent bits mean more precision. The exponent sets range; the fraction sets precision.

## Endianness

### Intuition

A 32-bit value occupies 4 bytes. **Endianness** is the order those bytes are placed in memory. **Big-endian** stores the most significant byte at the lowest address, like we write numbers. **Little-endian** stores the least significant byte first.

### How it works

```text
uint32_t 0x12345678 at address 0x100

address:      0x100 0x101 0x102 0x103
big-endian:     12    34    56    78
little-endian:  78    56    34    12
```

Endianness reorders whole bytes, never the bits inside a byte. It applies to each multi-byte value on its own. An array of values keeps its element order, and a byte string such as UTF-8 text is identical on every machine.

### Example

```c
#include <stdio.h>
#include <stdint.h>

int main(void) {
    uint32_t x = 0x12345678;
    unsigned char *p = (unsigned char *)&x;
    for (int i = 0; i < 4; i++)
        printf("%02X ", p[i]);
    printf("\n"); // little-endian: 78 56 34 12
    return 0;
}
```

Reading an object through an `unsigned char *` is always allowed in C, which makes it the standard way to inspect raw bytes.

### Under the hood

x86-64 is little-endian. ARM64 can run either way but is almost always configured little-endian. Network protocols use big-endian, called **network byte order**, so C programs convert with `htonl`, `htons`, `ntohl`, and `ntohs`. Networking is covered in topic 22.

File formats pick their own order and document it: PNG uses big-endian integers, while BMP uses little-endian. A hex dump of little-endian memory looks "backwards" because the dump lists bytes in address order.

### Pitfalls

- Writing a struct's raw bytes to a file or socket, then reading it on a machine with the other byte order.
- Forgetting to convert a port number with `htons`.
- Assuming endianness flips bits within a byte, or reverses arrays and strings.

## Text Encoding

### Intuition

Computers store numbers, so text needs a table that maps each character to a number, plus a rule for turning those numbers into bytes. Keep two ideas separate: the **character set** (which number each character gets) and the **encoding** (which bytes represent that number).

### How it works

**ASCII** uses 7 bits for 128 characters: 'A' is 65 (0x41), 'a' is 97 (0x61), '0' is 48 (0x30). It has no accented letters or other scripts.

**Unicode** is a character set, not an encoding. It assigns every character a **code point**, written U+0000 to U+10FFFF. Encodings then turn code points into bytes: UTF-8, UTF-16, and UTF-32.

**UTF-8** uses 1 to 4 bytes per code point:

```text
range              bytes
U+0000..U+007F     0xxxxxxx
U+0080..U+07FF     110xxxxx 10xxxxxx
U+0800..U+FFFF     1110xxxx 10xxxxxx 10xxxxxx
U+10000..U+10FFFF  11110xxx 10xxxxxx 10xxxxxx
                   10xxxxxx
```

Write the code point in binary, then fill the x positions from right to left, padding with zeros on the left.

```text
U+20AC (euro sign)
binary   0010 0000 1010 1100
split    0010 | 000010 | 101100
bytes    1110 0010  10 000010  10 101100
       = E2 82 AC
```

### Example

```c
#include <stdio.h>
#include <string.h>

int main(void) {
    const char *s = "café";     // "café"
    size_t n = strlen(s);
    printf("%zu\n", n);              // 5
    for (size_t i = 0; i < n; i++)
        printf("%02X ", (unsigned char)s[i]);
    printf("\n"); // 63 61 66 C3 A9
    return 0;
}
```

`strlen` counts bytes, not characters: "café" has 4 characters but 5 bytes, because é (U+00E9) needs two bytes in UTF-8.

### Under the hood

A string in memory is only bytes. The encoding is not stored with them, so every program that reads text must know or guess it. If UTF-8 bytes are decoded as a single-byte encoding such as Windows-1252, each byte becomes its own character: é (C3 A9) shows up as "Ã©". This garbling is called **mojibake**.

UTF-8 has two useful properties. Any ASCII text is already valid UTF-8 with the same bytes. It is also **self-synchronizing**: continuation bytes always start with 10, so from any position you can find the start of a character. Because UTF-8 is a sequence of single bytes, it has no endianness. UTF-16 and UTF-32 use 2- and 4-byte units, so they do.

Java and JavaScript strings use UTF-16 code units internally. Code points above U+FFFF need two units (a **surrogate pair**), so in JavaScript `"😀".length` is 2. What a user sees as one character can also be several code points: e followed by a combining accent (U+0301), or an emoji family joined by zero-width joiners.

### Pitfalls

- Treating byte count, code-unit count, or code-point count as "number of characters".
- Cutting a UTF-8 string at an arbitrary byte, which can split a character and leave invalid bytes.
- Believing Unicode means "2 bytes per character".
- Decoding with the wrong encoding, producing mojibake.

## Worked Examples

### 1. Hex to decimal and binary

Convert 0x3F7.

```text
3*256 + 15*16 + 7 = 768 + 240 + 7 = 1015
binary: 3 -> 0011, F -> 1111, 7 -> 0111
0x3F7 = 0011 1111 0111 = 1015
```

### 2. Signed overflow in 8 bits

Add 100 + 50 as 8-bit values and interpret the result.

```text
 100 = 0110 0100
  50 = 0011 0010
 sum = 1001 0110 = 150 unsigned
signed: 150 - 256 = -106
carry flag: 0 (no carry out of bit 7)
overflow flag: 1 (pos + pos gave neg)
```

As unsigned bytes, 150 is correct. As signed bytes, the true answer 150 does not fit in −128..127, so the bits read as −106.

### 3. Decode a float

What value is the float with bits 0x41200000?

```text
0x41200000 = 0100 0001 0010 0000 ...
sign     0
exponent 1000 0010 = 130, 130 - 127 = 3
fraction 0100 000... -> 1.01b = 1.25
value    1.25 x 2^3 = 10.0
```

### 4. Decode UTF-8 bytes

Which code point do the bytes F0 9F 98 80 encode?

```text
F0 = 11110 000   (4-byte lead, bits 000)
9F = 10 011111
98 = 10 011000
80 = 10 000000
join: 000 011111 011000 000000
    = 0 0001 1111 0110 0000 0000
    = U+1F600 (grinning face emoji)
```

## Common Misconceptions

1. **M1: Binary, decimal, and hex are different ways of storing a number.** They are only notations. Memory holds bits; base is a choice made when printing or writing a literal.
2. **M2: Negative integers are stored as a sign bit plus the magnitude.** That is sign-magnitude. Modern machines use two's complement, where the top bit has weight −2^(n−1).
3. **M3: To negate in two's complement, you just invert the bits.** Inverting alone is ones' complement and is off by one. You must also add 1.
4. **M4: The signed range is symmetric, like −127 to 127 or −128 to 128.** It is −2^(n−1) to 2^(n−1) − 1: one more negative value than positive.
5. **M5: Signed integer overflow in C reliably wraps around.** It is undefined behavior, and optimizers exploit that. Only unsigned arithmetic is defined to wrap.
6. **M6: Floats store decimals like 0.1 exactly, so `==` on computed results is reliable.** Most decimal fractions are rounded to the nearest binary fraction, and every operation rounds again.
7. **M7: Floating-point precision is the same at every magnitude.** Precision is relative. The gap between neighboring values grows with size; beyond 2^53, doubles skip integers.
8. **M8: Endianness reverses bits, or reverses arrays and strings.** It only orders the bytes within each multi-byte value. Bits in a byte, element order, and UTF-8 byte strings are unaffected.
9. **M9: Unicode is an encoding that uses 2 bytes per character.** Unicode assigns code points. UTF-8 uses 1–4 bytes per code point, and UTF-16 uses 2 or 4.
10. **M10: String length equals the number of visible characters.** `strlen` counts bytes, JavaScript `.length` counts UTF-16 units, and one visible character can be several code points.
11. **M11: n bits can count up to 2^n.** There are 2^n patterns, so the maximum unsigned value is 2^n − 1.
12. **M12: Unsigned values can go negative, and signed/unsigned comparisons compare true values.** Unsigned arithmetic wraps to large values, and in a mixed comparison C converts the signed operand to unsigned.

## In the Real World

Representation bugs have caused famous failures. The first Ariane 5 launch in 1996 was lost when a 64-bit floating-point value was converted to a 16-bit signed integer that could not hold it. The Patriot missile timing failure in 1991 came from 0.1 having no exact binary representation, an error that accumulated over hours of uptime.

A typical debugging story: a dashboard shows the wrong order for some records, but only in the browser. The backend uses 64-bit integer IDs, and the JSON is parsed in JavaScript into doubles. IDs above 2^53 round to a neighboring value, so two different records end up with the same ID. The fix is to send large IDs as strings.

In interviews, expect to convert between bases, state a two's complement range, explain why `0.1 + 0.2 != 0.3`, detect endianness in C, or count the bytes in a UTF-8 string. Interviewers care most that you can explain why, not recite rules.

## Try It Yourself

1. Compile and run the endianness example from this lesson. Then change `x` to `0x01` and predict the output before running it.
2. In Python 3, run `"naïve".encode("utf-8")` and `len()` on both the string and the bytes. Explain the difference.
3. In Python 3, run `import struct; struct.pack(">f", -6.25).hex()` and check it against the float example in this lesson.

## Cheat Sheet

| Fact | Value |
|---|---|
| n-bit unsigned range | 0 to 2^n − 1 |
| n-bit signed range | −2^(n−1) to 2^(n−1) − 1 |
| Negate (two's comp.) | invert all bits, add 1 |
| Read negative pattern | unsigned value − 2^n |
| Hex digit | 4 bits; 2 hex digits = 1 byte |
| float / double | 1+8+23 / 1+11+52 bits |
| Float value | (−1)^s × 1.f × 2^(e − bias) |
| Exact double integers | up to 2^53 |
| Little-endian | least significant byte first |
| Network byte order | big-endian |
| ASCII | 7 bits, 'A' = 0x41 |
| UTF-8 lengths | 1, 2, 3, 4 bytes by range |
| Continuation byte | 10xxxxxx |

## Further Reading

- *Computer Systems: A Programmer's Perspective*, Randal E. Bryant and David R. O'Hallaron (Pearson), chapter 2.
- "What Every Computer Scientist Should Know About Floating-Point Arithmetic", David Goldberg, ACM Computing Surveys, 1991.
- RFC 3629, "UTF-8, a transformation format of ISO 10646", IETF: https://www.rfc-editor.org/rfc/rfc3629
- *The Unicode Standard*, The Unicode Consortium: https://www.unicode.org/
