package com.finnova.bank.loans;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import com.finnova.bank.common.ApiException;
import static org.junit.jupiter.api.Assertions.*;
class EmiEngineTest {
    private final EmiEngine engine=new EmiEngine();
    @Test void independentStandardExampleAndFirstMonth(){
        var result=engine.calculate(new BigDecimal("100000.00"),new BigDecimal("12.00"),12,LocalDate.of(2026,1,1));
        assertEquals(new BigDecimal("8884.88"),result.emi());
        assertEquals(new BigDecimal("1000.00"),result.schedule().getFirst().interest());
        assertEquals(new BigDecimal("7884.88"),result.schedule().getFirst().principal());
        assertEquals(new BigDecimal("92115.12"),result.schedule().getFirst().remaining());
        reconcile(new BigDecimal("100000.00"),result);
    }
    @Test void zeroInterestLastInstallmentAbsorbsRounding(){
        var result=engine.calculate(new BigDecimal("1000.00"),new BigDecimal("0.00"),3,LocalDate.of(2026,1,31));
        assertEquals(new BigDecimal("333.33"),result.emi());
        assertEquals(new BigDecimal("333.34"),result.schedule().getLast().total());
        assertEquals(new BigDecimal("0.00"),result.totalInterest());
        assertEquals(LocalDate.of(2026,2,28),result.schedule().get(1).dueDate());
        assertEquals(LocalDate.of(2026,3,31),result.schedule().get(2).dueDate());reconcile(new BigDecimal("1000.00"),result);
    }
    @Test void oneMonthIndependentExample(){
        var result=engine.calculate(new BigDecimal("1000.00"),new BigDecimal("12.00"),1,LocalDate.of(2026,1,1));
        assertEquals(new BigDecimal("1010.00"),result.emi());assertEquals(new BigDecimal("10.00"),result.totalInterest());reconcile(new BigDecimal("1000.00"),result);
    }
    @Test void rejectsInvalidValuesWithoutFloatingPoint(){
        for(String principal:new String[]{"0.00","-1.00","1.001"})assertThrows(ApiException.class,()->engine.calculate(new BigDecimal(principal),BigDecimal.ZERO,12,LocalDate.of(2026,1,1)));
        assertThrows(ApiException.class,()->engine.calculate(new BigDecimal("1000.00"),new BigDecimal("-1.00"),12,LocalDate.of(2026,1,1)));
        assertThrows(ApiException.class,()->engine.calculate(new BigDecimal("1000.00"),BigDecimal.ZERO,0,LocalDate.of(2026,1,1)));
    }
    private void reconcile(BigDecimal principal,EmiEngine.Result result){
        BigDecimal sum=result.schedule().stream().map(EmiEngine.Row::principal).reduce(BigDecimal.ZERO,BigDecimal::add);
        assertEquals(0,principal.compareTo(sum));assertEquals(new BigDecimal("0.00"),result.schedule().getLast().remaining());
        for(var row:result.schedule()){assertEquals(row.total(),row.principal().add(row.interest()));assertTrue(row.remaining().signum()>=0);}
        assertEquals(0,principal.add(result.totalInterest()).compareTo(result.totalPayment()));
    }
}
