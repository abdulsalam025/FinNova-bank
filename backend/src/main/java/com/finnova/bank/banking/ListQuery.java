package com.finnova.bank.banking;
import java.util.Set;
import com.finnova.bank.common.ApiException;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
public record ListQuery(int page,int size,String sortBy,String direction,Pageable pageable) {
    public static ListQuery of(int page,int size,String by,String direction,Set<String> allowed) {
        if(page<0 || page>100000 || size<1 || size>100) throw new ApiException(HttpStatus.BAD_REQUEST,"Use page 0..100000 and size 1..100.");
        if(!allowed.contains(by)) throw new ApiException(HttpStatus.BAD_REQUEST,"Unsupported sort field.");
        Sort.Direction order;
        try { order=Sort.Direction.fromString(direction); }
        catch(IllegalArgumentException ex){throw new ApiException(HttpStatus.BAD_REQUEST,"Sort direction must be ASC or DESC.");}
        Sort sort=Sort.by(order,by);
        if(!"id".equals(by)) sort=sort.and(Sort.by(order,"id"));
        return new ListQuery(page,size,by,order.name(),PageRequest.of(page,size,sort));
    }
    public static String search(String value) {
        if(value==null) return null;
        String trimmed=value.trim();
        if(trimmed.length()>100) throw new ApiException(HttpStatus.BAD_REQUEST,"Search is limited to 100 characters.");
        return trimmed.isEmpty()?null:trimmed;
    }
    public static String like(String value){
        return "%"+value.toLowerCase(java.util.Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
    }
}
