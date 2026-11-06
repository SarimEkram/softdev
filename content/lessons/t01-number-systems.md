---
id: t01
slug: number-systems
title: Number Systems and Data Representation
tier: 1
prerequisites: []
estimatedMinutes: 20
learningObjectives:
  - Convert values between binary, decimal, and hexadecimal
  - Read and write negative numbers in two's complement
  - Explain why floating-point results are approximate
  - Describe byte order and how text becomes bytes
version: 2
---

## Why this matters

Everything a computer stores is a pattern of bits. Overflow bugs, `0.1 + 0.2 != 0.3`, and garbled text like "Ã©" all come from reading those bits the wrong way. This lesson covers the basics you need to spot them.

Assumptions: C on a typical x86-64 or ARM64 laptop, IEEE 754 floating point, UTF-8 text.

## Bits, Bytes, and Number Bases

A **bit** is 0 or 1. A **byte** is 8 bits. With n bits you get 2^n patterns, so unsigned values run from 0 to 2^n − 1. A byte holds 0 to 255.

A number base is just a way of writing a value. In binary each position is worth 2 times the one to its right; in decimal, 10 times; in hexadecimal ("hex"), 16 times.

- Binary to decimal: add up the place values of the 1 bits.
- Decimal to binary: divide by 2 repeatedly and read the remainders from last to first.
- Hex uses the digits 0–9 and A–F (A = 10, ..., F = 15). Each hex digit is exactly 4 bits, so convert by grouping bits in fours.

```text
181 = 128 + 32 + 16 + 4 + 1
    = 1011 0101
    =    B    5   -> 0xB5
```

> Key idea: binary, decimal, and hex are only notations. Memory holds bits; the base is how you choose to write them.

## Two's Complement

Two's complement is how computers store negative integers. In n bits, the top bit has weight −2^(n−1) instead of +2^(n−1). Every other bit keeps its normal weight.

- Range: −2^(n−1) to 2^(n−1) − 1. For 8 bits that is −128 to 127.
- To negate a value, invert every bit and add 1.
- To read a pattern whose top bit is 1, take its unsigned value and subtract 2^n.

```text
-20 in 8 bits
+20       0001 0100
invert    1110 1011
add 1     1110 1100  (236 - 256 = -20)
```

Two's complement won because the same adder circuit works for signed and unsigned numbers, and there is only one zero. Older schemes like sign-magnitude (top bit is just a sign) had both +0 and −0.

### Overflow

Integers have a fixed width, so results that don't fit wrap around. In C, unsigned arithmetic is defined to wrap modulo 2^n. An unsigned value never goes below zero. Subtracting past zero wraps to a very large number. Signed overflow in C is undefined behavior, so never rely on it.

When a signed value is widened to more bits, the top bit is copied into the new high bits, so the value stays the same. This is **sign extension**. Unsigned values get zeros instead.

```c
#include <stdio.h>
#include <stdint.h>

int main(void) {
    uint8_t u = 250;
    u = u + 10;             // 260 wraps to 4
    printf("%d\n", u);      // 4
    int8_t s = -20;
    printf("%d\n", (uint8_t)s); // 236: same bits
    return 0;
}
```

## Floating Point

Floating point is scientific notation in base 2: a sign, an exponent, and a fraction. A `float` is 32 bits (1 sign, 8 exponent, 23 fraction). A `double` is 64 bits (1, 11, 52). The exponent sets the range; the fraction sets the precision.

A float keeps about 7 significant decimal digits, a double about 15–17. Every operation rounds its result to the nearest value the format can hold.

Fractions whose denominator is a power of two, like 0.5 or 0.375, are exact. Most others are not: 0.1 in binary is 0.000110011001100... repeating forever, just as 1/3 repeats in decimal.

```c
#include <stdio.h>

int main(void) {
    double a = 0.1 + 0.2;
    printf("%.17g\n", a);     // 0.30000000000000004
    printf("%d\n", a == 0.3); // 0
    return 0;
}
```

Precision is relative: the gap between neighboring values grows with size. Every integer up to 2^53 is exact in a double; beyond that, the gap exceeds 1. Rounding at every step also means (a + b) + c and a + (b + c) can give different results: floating-point addition is not associative. NaN ("not a number", from things like 0.0 / 0.0) compares unequal to everything, including itself.

> Watch out: don't compare computed floats with `==`. Compare with a tolerance suited to the magnitudes involved. Store money as integer cents.

## Endianness

A multi-byte value has to be laid out in memory one byte at a time. **Big-endian** puts the most significant byte at the lowest address. **Little-endian** stores the least significant byte first.

```text
uint32_t 0x12345678 at address 0x100
address:        100  101  102  103
big-endian:      12   34   56   78
little-endian:   78   56   34   12
```

Endianness moves whole bytes, never the bits inside a byte. It applies to each multi-byte value on its own. An array of values keeps its element order, and a UTF-8 string is the same bytes on every machine.

x86-64 and ARM64 laptops are little-endian. Network protocols use big-endian, called **network byte order**. Endianness matters whenever raw bytes leave one machine for a file or a network.

## Text Encoding

**ASCII** uses 7 bits for 128 characters: 'A' is 65 (0x41), 'a' is 97, '0' is 48. It has no accents or other scripts.

**Unicode** is a character set, not an encoding. It assigns every character a **code point**, written U+0000 to U+10FFFF. An encoding then turns code points into bytes. The most common is **UTF-8**, which uses 1 to 4 bytes:

```text
U+0000..U+007F     0xxxxxxx
U+0080..U+07FF     110xxxxx 10xxxxxx
U+0800..U+FFFF     1110xxxx 10xxxxxx 10xxxxxx
U+10000..U+10FFFF  11110xxx + three 10xxxxxx
```

Write the code point in binary, then fill the x positions from right to left, padding with zeros on the left. For example, € is U+20AC and becomes E2 82 AC.

Useful facts:

- Any ASCII text is already valid UTF-8, one byte per character.
- Continuation bytes always start with 10, so from any position you can find the start of a character.
- C's `strlen` counts bytes, so "café" has length 5.
- If UTF-8 bytes are decoded as a single-byte encoding such as Windows-1252, each byte becomes its own character: "é" turns into "Ã©".

## Worked Examples

### 1. Hex to decimal

```text
0x3F7 = 3*256 + 15*16 + 7
      = 768 + 240 + 7 = 1015
binary: 0011 1111 0111
```

### 2. 8-bit overflow

```text
 100 = 0110 0100
  50 = 0011 0010
 sum = 1001 0110 = 150 unsigned
signed: 150 - 256 = -106
```

150 fits in an unsigned byte but not in −128..127, so as a signed byte it reads as −106.

## Common Misconceptions

1. **M1: Binary, decimal, and hex store numbers differently.** They are notations for the same bits.
2. **M2: Negative numbers are a sign bit plus the size.** That is sign-magnitude. Computers use two's complement.
3. **M3: To negate, just invert the bits.** You must also add 1.
4. **M4: The signed range is symmetric.** It has one more negative value: −128 to 127 in 8 bits.
5. **M5: Signed overflow in C reliably wraps.** It is undefined behavior. Only unsigned wraps by definition.
6. **M6: Floats store decimals like 0.1 exactly.** Most decimal fractions are rounded, and every operation rounds again.
7. **M7: Float precision is the same at every size.** Gaps between values grow as numbers grow.
8. **M8: Endianness reverses bits, arrays, or strings.** It only orders the bytes inside each multi-byte value.
9. **M9: Unicode means 2 bytes per character.** Unicode assigns numbers; UTF-8 uses 1 to 4 bytes.
10. **M10: String length is the number of visible characters.** `strlen` counts bytes.
11. **M11: n bits can count up to 2^n.** The maximum is 2^n − 1.
12. **M12: Unsigned values can go negative.** They wrap to large positive values.

## Cheat Sheet

| Fact | Value |
|---|---|
| n-bit unsigned | 0 to 2^n − 1 |
| n-bit signed | −2^(n−1) to 2^(n−1) − 1 |
| Negate | invert bits, add 1 |
| Hex digit | 4 bits |
| float / double | 32 / 64 bits |
| Exact double integers | up to 2^53 |
| Little-endian | low byte first |
| Network order | big-endian |
| ASCII 'A' | 65 = 0x41 |
| UTF-8 | 1–4 bytes per code point |
| Continuation byte | 10xxxxxx |
