package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import com.finnova.bank.banking.BankingDtos.PageView;
import com.finnova.bank.banking.ListQuery;
import com.finnova.bank.common.ApiException;
import com.finnova.bank.loans.LoanDtos.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service
public class ProductService {
    private final ProductRepository products;private final LoanPolicy policy;private final EmiEngine engine;private final Clock clock;
    public ProductService(ProductRepository products,LoanPolicy policy,EmiEngine engine,Clock clock){this.products=products;this.policy=policy;this.engine=engine;this.clock=clock;}
    @Transactional(readOnly=true)public PageView<ProductView> list(String q,int page,int size){
        var query=ListQuery.of(page,size,"id","ASC",Set.of("id"));String search=ListQuery.search(q);
        var result=products.findAll((r,c,b)->search==null?b.isTrue(r.get("active")):b.and(b.isTrue(r.get("active")),b.like(b.lower(r.get("name")),ListQuery.like(search),'\\')),query.pageable());
        return new PageView<>(result.getContent().stream().map(LoanDtos::view).toList(),page,size,result.getTotalElements(),result.getTotalPages(),"id","ASC");
    }
    @Transactional(readOnly=true)public ProductView detail(long id){return LoanDtos.view(active(id));}
    @Transactional(readOnly=true)public Quote quote(long id,BigDecimal principal,int months,BigDecimal rate){
        LoanProduct product=active(id);BigDecimal selected=rate==null?product.annualRate:rate;
        policy.product(product,principal,selected,months);
        return new Quote(LoanDtos.view(product),principal.setScale(2),months,selected,engine.calculate(principal,selected,months,LocalDate.now(clock.withZone(ZoneId.of("Asia/Kolkata"))).plusMonths(1)));
    }
    @Transactional(readOnly=true)public List<Quote> compare(List<Long> ids,BigDecimal principal,int months){
        if(ids==null||ids.size()<2||ids.size()>3||new HashSet<>(ids).size()!=ids.size())throw new ApiException(HttpStatus.BAD_REQUEST,"Compare two or three distinct product IDs.");
        return ids.stream().map(id->quote(id,principal,months,null)).toList();
    }
    private LoanProduct active(long id){return products.findById(id).filter(p->p.active).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Active loan product not found."));}
}
