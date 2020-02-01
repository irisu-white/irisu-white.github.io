---
title: Glibc中realloc流程分析
date: 2018-04-20
tag: Bin
layout: post
---

这只是个简单的记录。其实使用流程图更好一些，但是我懒得做了。

``` c
void *realloc(void *ptr, int bytes);

void *newp;
int nb = request2size(bytes);
int oldsize = chunksize(ptr);
```

* if(bytes == 0)
    1. free(oldp)
    2. return(0)

* if(ptr == NULL)
    1. newp = malloc(bytes)
    2. return(newp)

* else
    * if(oldsize >= nb)
        * GOTO:Split
    * if(use_topbin)
        1. split(top)
        2. merge(ptr, top)
        3. return(newp)
    * if(!inuse(next_chunk))
        1. unlink(next_chunk)
        2. merge(ptr, next_chunk)
        3. GOTO:Split
    * other
        1. newp = malloc(nb - `MALLOC_ALIGN_MASK`)
        2. if(newp == next_chunk)
            * GOTO:Split
        3. memcpy(ptr, newp, size)
        4. free(ptr)
        5. return(newp)

* Split
    * if(remainder < `MIN_SIZE`)
        1. set_head(newp)
        2. return(newp)
    * else
        1. split(remainder)
        2. set_head(remainder)
        3. set_head(newp)
        4. free(remainder)
        6. return(newp)
