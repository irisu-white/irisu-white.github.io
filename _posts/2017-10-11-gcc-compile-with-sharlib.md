---
title: 在GCC编译时指定额外共享库
date: 2017-10-11
tag: CS
layout: post
---

GCC在编译时可以指定编译为共享文件, 通常命名为`foobar.so`.

但是编译好的库是没有办法直接装载的, 因为在Linux的shard-library搜索路径不包含当前目录(`.`目录), 即使是将ELF文件和.so文件放在一起也没办法正常装载.

有好几种解决办法:

- 将库文件放入系统库目录下

[这篇文章](https://www.eyrie.org/~eagle/notes/rpath.html)描述了Linux下的shared Library搜索路径.

这是最简单的办法, 但是貌似最没有用(如果只是自己用的小型库).

- 指定系统参数

在环境变量中指定装载的搜索路径.

在`~/.bashrc`中添加:

`export LD_LIBRARY_PATH=/Your/Path`

或者直接在terminal中执行此语句(在terminal关闭后失效).

- 指定编译参数

在gcc中添加参数:

`-Wl,-rpath=/Your/Path`

要注意的是, 上面的语句是两个参数, 具体解释可以查看`man gcc`和`man ld`

man gcc:

> -Wl,option
>
> Pass option as an option to the linker. If option contains commas, it is split into multiple options at the commas. You can use this syntax to pass an argument to the option. For example, -Wl,-Map,output.map passes -Map output.map to the linker. When using the GNU linker, you can also get the same effect with `-Wl,-Map=output.map'.

man ld:

> -rpath=dir
>
> Add a directory to the runtime library search path. This is used when linking an ELF executable with shared objects. All -rpath arguments are concatenated and passed to the runtime linker, which uses them to locate shared objects at runtime. The -rpath option is also used when locating shared objects which are needed by shared objects explicitly included in the link;

