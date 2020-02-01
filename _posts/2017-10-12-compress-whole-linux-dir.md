---
title: 在Linux下压缩整个文件夹
date: 2017-10-12
tag: CS
layout: post
---

熟悉Linux命令的话，会发现大部分命令都很"单纯"：当你试图指定一个文件夹为目标时，命令并没有按照预期将功能作用与整个文件夹内的文件。

比如cp命令，作用与dir时只会复制dir和其下的子文件，但是dir内的二级文件夹就被忽略了。

zip，gzip，等等压缩命令的表现更单纯：他们只会压缩"文件夹"本身

`zip foo.zip dir-A`执行后，解压foo.zip，只会产生一个空的dir-A文件夹。

gzip也是一样的。


## 0x00 解决办法

查阅zip的help，可以发现`-r`参数：递归压缩文件。

所以对待zip就很简单了，使用`-r`参数即可：

```
zip -r foo.zip dir-A dir-B ... dir-N
```

对于gzip，更通用的办法是使用tar：先归档(将堆文件合并)，再压缩

归档后产生的文件是foo.tar，对其压缩，会产生foo.tar.gz

很熟悉？这就是为什么经常会有xxx.tar.xx这类后缀的原因。

可以单独使用tar命令进行归档操作：

```
tar -cvf foo.tar dir-A dir-B ... dir-N
```

然后使用gzip压缩。不过更好的办法是，使用tar提供的便捷参数`-z`

```
tar -zcvf foo.tar.gz dir-A dir-B ... dir-N
```

`-z`命令会在对目标归档后直接调用gzip对其进行压缩，前提是已经安装了gzip。

余下的参数：

* `-c`：创建归档，想对应的，解压归档的参数是`-x`
* `-v`：输出详细信息
* `-f`：指定输出文件名称

其中`-c`和`-f`是必要的(如果按照一般的用法)。

在解压时，对于zip文件，直接使用unzip即可。

对于foo.tar.gz，解压时可以使用此命令解压：

```
tar -zxvf foo.tar.gz
```

或者可以更直接：

```
tar -xvf foo.tar.gz
```

tar十分智能，会自动检测不同类型的Unix类压缩命令格式，自动调用进行解压。

PS：如果只希望将文件打包，不考虑减小文件体积，只使用tar进行归档操作即可。

详细的说明可以查阅zip，unzip，gzip，tar的文档。














