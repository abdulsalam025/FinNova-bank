package com.finnova.bank.reports;
import java.time.*;
import com.finnova.bank.common.ApiException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class DateWindowTest {
    final Clock clock=Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"),ZoneOffset.UTC);
    @Test void inclusiveIndiaDayBecomesCorrectUtcExclusiveBounds(){var w=DateWindow.of(LocalDate.of(2026,1,2),LocalDate.of(2026,1,2),clock);assertEquals(Instant.parse("2026-01-01T18:30:00Z"),w.start());assertEquals(Instant.parse("2026-01-02T18:30:00Z"),w.end());}
    @Test void defaultsToThirtyDaysAndAllowsOneLeapYear(){var w=DateWindow.of(null,null,clock);assertEquals(LocalDate.of(2025,12,3),w.from());assertEquals(LocalDate.of(2026,1,1),w.to());assertNotNull(DateWindow.of(LocalDate.of(2024,1,1),LocalDate.of(2024,12,31),clock));}
    @Test void rejectsReversedAndUnboundedRanges(){assertEquals(400,assertThrows(ApiException.class,()->DateWindow.of(LocalDate.of(2026,2,1),LocalDate.of(2026,1,1),clock)).status().value());assertThrows(ApiException.class,()->DateWindow.of(LocalDate.of(2020,1,1),LocalDate.of(2026,1,1),clock));}
}
