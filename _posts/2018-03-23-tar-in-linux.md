---
title: Linux下的tar命令
date: 2018-03-23
tag: CS
layout: post
---

tar命令用于文件归档,也就是将一堆文件打包成一个文件.在这个过程中,没有任何的数据压缩发生.

如果需要用gzip压缩整个文件夹,需要先用tar打包.之所以这样,是因为gzip不支持`-r`或者`-a`这种打包整个文件夹的参数.

zip支持`-r`命令.

### 对文件进行打包

```
tar cvf output_name.tar your_dirs
```

其中的参数:

* -c: 打包
* -v: 输出打包时的信息
* -f: 指定输出名称(需要以`.tar`结尾)

打包结束后会生成`out_put.tar`文件.

### 在打包后使用gzip压缩

```
tar zcvf output_name.tar.gz your_dirs
```

其中的参数:

* -cvf: 和上面相同
* -z: 使用gzip进行压缩

这是其实是一个分步过程,tar在打包结束后自动调用gzip对文件进行了压缩.

后缀的变化过程: `output.tar -> output.tar.gz`

### 其他的压缩格式

除了`-z`对应的gzip外,还可以使用下面几种压缩类型:

* `-j`: 对应bzip2,输出格式为`output.tar.bz2`
* `-J`: 对应xz,输出格式为`output.tar.xz`
* `-Z`: 对应compress,输出格式为`output.tar.Z`

### 解包 / 解压

```
tar xvf your_tar_file
```

参数说明:

* -x: 解包
* -v: 输出解包时的信息
* -f: 指定输入文件

有趣的是,tar可以智能的识别出`.gz`和`.xz`和`.bz`还有`.Z`后缀的文件,在解包前自动调用对应程序进行解压操作,然后对得到的`.tar`文件进行解包.

只要一条指令,就能应对大部分的压缩格式(zip和rar除外).

如果真的想自己指定解压类型的话,只要和压缩时一样,带上想对应的`zjZJ`参数即可.

如果单独使用gzip解压缩`file.tar.gz`文件,只会得到一个`file.tar`,需要再次调用tar解包.


