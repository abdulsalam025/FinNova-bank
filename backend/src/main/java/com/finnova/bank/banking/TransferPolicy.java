package com.finnova.bank.banking;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import com.finnova.bank.banking.BankingDtos.TransferRequest;
import com.finnova.bank.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
@Component
public class TransferPolicy {
    public static final BigDecimal MAX_MONEY=new BigDecimal("9999999999999.99");
    public record Canonical(long source,long target,BigDecimal amount,String note,String fingerprint) { }
    public record Balances(BigDecimal source,BigDecimal target) { }
    public Canonical canonical(TransferRequest request){
        if(request==null || request.sourceAccountId()==null || request.targetAccountId()==null || request.sourceAccountId()<=0 || request.targetAccountId()<=0)
            throw invalid("Two positive account IDs are required.");
        if(request.sourceAccountId().equals(request.targetAccountId()))throw invalid("Choose two different accounts.");
        BigDecimal amount=request.amount();
        if(amount==null || amount.signum()<=0 || amount.scale()>2 || amount.compareTo(MAX_MONEY)>0)throw invalid("Use a positive INR amount with at most two decimal places.");
        amount=amount.setScale(2,RoundingMode.UNNECESSARY);
        String note=request.note()==null?"":request.note().trim();
        if(note.length()>120 || note.chars().anyMatch(Character::isISOControl))throw invalid("Transfer notes must be at most 120 characters without control characters.");
        String input="TRANSFER:v1:"+request.sourceAccountId()+":"+request.targetAccountId()+":"+amount.toPlainString()+":"+note.length()+":"+note;
        try {
            String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.getBytes(StandardCharsets.UTF_8)));
            return new Canonical(request.sourceAccountId(),request.targetAccountId(),amount,note,hash);
        }catch(NoSuchAlgorithmException ex){throw new IllegalStateException("Required SHA-256 algorithm unavailable");}
    }
    public String key(String value){
        if(value==null || !value.matches("[A-Za-z0-9._:-]{1,128}"))throw new ApiException(HttpStatus.BAD_REQUEST,"A valid Idempotency-Key header (1..128 ASCII letters/digits/._:-) is required.");
        return value;
    }
    public Balances balances(BigDecimal source,BigDecimal target,BigDecimal amount){
        if(source.compareTo(amount)<0)throw invalid("Insufficient simulated balance.");
        BigDecimal credit=target.add(amount).setScale(2,RoundingMode.UNNECESSARY);
        if(credit.compareTo(MAX_MONEY)>0)throw invalid("The destination balance would exceed the supported limit.");
        return new Balances(source.subtract(amount).setScale(2,RoundingMode.UNNECESSARY),credit);
    }
    private ApiException invalid(String message){return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,message);}
}
