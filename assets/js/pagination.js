// main
function setFilter(attr, value){
    let target = [];
    $("#post-list").children().each(function(){
        let e = $(this).find(attr);
        for(i = 0; i < e.length; ++i){
            if(e.eq(i).html() === value){
                target.push($(this));
            }
        }
        $(this).hide();
    });
    if(target.length > 0){
        window.filter = target;
        $("#post-selector").twbsPagination(
            "changeTotalPages",
            Math.ceil(target.length / 8), 1
        );
    }
    else{
        throw new Error("filter is empty");
    }
}
function initPagination(){
    let count = Math.ceil($("#post-list").children().length / 8);
    $("#post-selector").twbsPagination({
        totalPages: count,
        visiblePages: 10,
        onPageClick: function(event, page){
            $(window).scrollTop(0);
            // select target
            if(window.filter.length > 0){
                window.filter.forEach(function(value, i){
                    if((i >= (page - 1) * 8) && (i < page * 8)){
                        value.show();
                    }
                    else{
                        value.hide();
                    }
                });
            }
            // all post
            else{
                $("#post-list").children().each(function(i){
                    if((i >= (page - 1) * 8) && (i < page * 8)){
                        $(this).show();
                    }
                    else{
                        $(this).hide();
                    }
                });
            }
        }
    });
}
// auto start
$(document).ready(function(){
    window.filter = [];
    initPagination();
    // bind filter
    $("#farticle").on("click", function(){
        window.filter = [];
        let count = Math.ceil($("#post-list").children().length / 8);
        $("#post-selector").twbsPagination("changeTotalPages", count, 1);
    });
    $("#fcollection").on("click", function(){
        // TODO
    });
    $("#filter").children(".filter-tag").each(function(){
        let v = $(this).find(".data").html();
        $(this).on("click", function(){
            setFilter(".post-tag", v);
        });
    });
    $("#filter").children(".filter-category").each(function(){
        let v = $(this).find(".data").html();
        $(this).on("click", function(){
            setFilter(".post-category", v);
        });
    });
});