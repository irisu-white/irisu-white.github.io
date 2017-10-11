---
title: [Python] Windows下调整控制台大小
date: 2016-10-20
tag: Code
layout: post
---

对于Linux来说方法有很多. 一开始执着于window没有各种命令...后来看了Stack Overflow才醒悟过来.

window下的mode命令(程序)便是用来进行cmd(powershell)页面设置的. 更多细节可以通过`mode /?`查看.

```bash
C:\> mode con: cols=25 lines=80
```

即可设置屏幕大小为(25,80)

所以只要用python直接执行子程序就可以了.

```python
from subprocess import call

def set_wincmd_size(width, height):
    call(
        ["mode", "con:", "cols={}".format(width), "lines={}".format(height)],
        shell=True
    )
```

这样就得到了一个随意设置大小的函数. 注意的是`shell=True`在win下是必须的(详情见call的文档).

对于特定平台, 除了API以外, 直接通过调用系统命令(程序)也是很好的方式.

