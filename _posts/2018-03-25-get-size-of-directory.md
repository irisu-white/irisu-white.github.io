---
title: 在Linux中统计文件夹体积
date: 2018-03-25
tag: CS
layout: post
---

ls命令用于列出目录的全部子项目.但是ls仅仅是ls,并不能提供参数让我们统计文件夹的体积.

du命令用于统计目标占用的磁盘大小.

如果我们想统计一个文件夹(及其子内容)所占磁盘空间的话:

``` bash
du -sh file_path
```

其中:

* -s, --summarize: 仅显示统计总和
* -h, --human-readable: 将输出字节数转换为人类易读的单位(比如MB,GB)

默认没有`-s`参数时,du只会列出每个单个子条目的大小.

如果需要同时获得子条目大小和统计总和, 可以使用`-c`参数.

此命令linux通常会自带, 如同ls一样.

具体细节可以参见`man du`.

