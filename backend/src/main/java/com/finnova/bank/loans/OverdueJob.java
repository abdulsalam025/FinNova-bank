package com.finnova.bank.loans;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.*;
import org.springframework.stereotype.Component;
@Component@ConditionalOnProperty(name="app.loans.overdue-enabled",havingValue="true",matchIfMissing=true)
public class OverdueJob {
    @Configuration@EnableScheduling public static class Scheduling{}
    private final OverdueService service;
    public OverdueJob(OverdueService service){this.service=service;}
    @Scheduled(initialDelayString="${app.loans.overdue-delay-ms:60000}",fixedDelayString="${app.loans.overdue-delay-ms:60000}")public void run(){service.scan();}
}
