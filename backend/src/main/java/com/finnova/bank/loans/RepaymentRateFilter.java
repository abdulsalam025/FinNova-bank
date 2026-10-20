package com.finnova.bank.loans;
import java.io.IOException;
import com.finnova.bank.banking.TransferProperties;
import com.finnova.bank.common.ApiErrorWriter;
import com.finnova.bank.security.*;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.filter.OncePerRequestFilter;
public class RepaymentRateFilter extends OncePerRequestFilter {
    private final InMemoryRateLimiter limiter;private final SecurityProperties security;private final TransferProperties policy;private final ApiErrorWriter errors;
    public RepaymentRateFilter(InMemoryRateLimiter limiter,SecurityProperties security,TransferProperties policy,ApiErrorWriter errors){this.limiter=limiter;this.security=security;this.policy=policy;this.errors=errors;}
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws ServletException,IOException{
        String path=request.getRequestURI().substring(request.getContextPath().length());
        if(security.rateLimitEnabled()&&"POST".equals(request.getMethod())&&path.matches("/api/loans/[0-9]+/installments/[0-9]+/pay")){
            var result=limiter.acquire("repayment:"+request.getRemoteAddr(),policy.requestsPerMinute());if(!result.allowed()){response.setHeader("Retry-After",Long.toString(result.retryAfterSeconds()));errors.write(request,response,HttpStatus.TOO_MANY_REQUESTS,"Too many repayments. Retry the original payload/key after waiting.");return;}
        }
        chain.doFilter(request,response);
    }
}
