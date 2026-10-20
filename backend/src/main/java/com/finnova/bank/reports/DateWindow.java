package com.finnova.bank.reports;
import java.time.*;
import java.time.temporal.ChronoUnit;
import com.finnova.bank.common.ApiException;
import org.springframework.http.HttpStatus;
public record DateWindow(LocalDate from,LocalDate to,Instant start,Instant end){
    public static DateWindow of(LocalDate from,LocalDate to,Clock clock){
        ZoneId zone=ZoneId.of("Asia/Kolkata");LocalDate end=to==null?LocalDate.now(clock.withZone(zone)):to;LocalDate beginning=from==null?end.minusDays(29):from;
        if(beginning.getYear()<1900||end.getYear()>2100||beginning.isAfter(end)||ChronoUnit.DAYS.between(beginning,end)>365)throw new ApiException(HttpStatus.BAD_REQUEST,"Use an inclusive date range of at most 366 days within 1900..2100.");
        return new DateWindow(beginning,end,beginning.atStartOfDay(zone).toInstant(),end.plusDays(1).atStartOfDay(zone).toInstant());
    }
}
