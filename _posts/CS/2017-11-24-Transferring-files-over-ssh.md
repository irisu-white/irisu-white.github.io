---
title: 在SSH中传输文件
date: 2017-11-24
tag: CS
layout: post
---

`cp`负责本地文件之间的拷贝工作。

`scp`和cp类似，只不过一端是远程文件，另一端是本地文件。

如果目标是文件夹，默认不会拷贝文件夹内的文件(和cp一样)。

添加`-r`参数即可拷贝文件价以及文件夹内的文件。

`-P`参数可以指定SSH端口。

全部参数可以参考`scp --help`或`man scp`。

### 下载远程服务器的文件

```
scp user@remote_host:remote_file local_file
```

### 上传文件到远程服务器

```
scp local_file user@remote_host:remove_file
```


