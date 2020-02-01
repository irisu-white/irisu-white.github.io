// main
function showPost(event, page){
    $(window).scrollTop(0);
    $("#post-list").children().each(function(i){
        if((i >= (page - 1) * 8) && (i < page * 8)){
            $(this).show();
        }
        else{
            $(this).hide();
        }
    });
}
// auto start
$(document).ready(function(){
    let count = $("#post-list").children().length;
    num = count / 8;
    if(count % 8 != 0){
        num += 1;
    }
    $("#post-selector").twbsPagination({
        totalPages: num,
        visiblePages: 10,
        onPageClick: showPost
    });
});