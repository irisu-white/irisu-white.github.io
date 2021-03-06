---
title: "GCC中的安全编译参数"
date: 2017-8-10
tag: CS
layout: post
---

Linux中有各种各样的安全防护，ASLR是由内核直接提供的，通过系统配置文件控制。NX，Canary，PIE，RELRO在编译时指定，根据各项参数调整。在无参数指定时，使用默认的参数。不同系统环境中默认选项并不相同。

有各种工具可以查看编译指定的安全选项。比如peda中的`checksec`命令，或者pwntools中的`pwn checksec`命令。

可以在gcc的手册中查看各类保护的描述，`man gcc`即可。

各种安全选择的编译参数如下：

* NX：`-z execstack` / `-z noexecstack` (关闭 / 开启)
* Canary：`-fno-stack-protector` / `-fstack-protector` (关闭 / 开启)
* PIE：`-no-pie` / `-pie` (关闭 / 开启)
* RELRO：`-z norelro` / `-z lazy` / `-z now` (关闭 / 部分开启 / 完全开启)

综合上面的参数，可以进行各种配置

* 最弱保护：

``` c
gcc hello.c -o hello-L -fno-stack-protector -z execstack -no-pie -z norelro
```

* 最强保护：

``` c
gcc hello.c -o hello-S -fstack-protector-all -z noexecstack -pie -z now
```

PS：

* -z为传入ld的key，具体的内容可以通过man ld找到
* -f和-fno-为相反的设定前缀，-f代表开启，-fno-代表关闭。man gcc中只描述了-f的选项，-fno的不重复列出。详细说明见文档起始部分。
* Canary的选项除开启和关闭外还有all，strong，explicit，分别代表不同的启用程度，具体见文档描述。

默认编译参数可以由环境变量CFLAG调节，如同makefile文件中的一样。比如：`export CFLAGS='-std=c99'`

