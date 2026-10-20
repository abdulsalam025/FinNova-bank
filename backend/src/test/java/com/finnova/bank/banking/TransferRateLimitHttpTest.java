package com.finnova.bank.banking;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties={"app.security.rate-limit-enabled=true","app.transfers.requests-per-minute=2"})
@AutoConfigureMockMvc(print=MockMvcPrint.NONE) @ActiveProfiles("dbtest")
class TransferRateLimitHttpTest {
    @Autowired MockMvc mvc;@Autowired ObjectMapper mapper;
    @Test void transferEndpointHasItsOwnBounded429LimiterWithoutMovingMoney()throws Exception{
        var csrf=mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        String header=csrf.getResponse().getHeaders("Set-Cookie").stream().filter(value->value.startsWith("FN_CSRF=")).findFirst().orElseThrow();
        Cookie cookie=new Cookie("FN_CSRF",header.substring(8,header.indexOf(';')));
        String token=mapper.readTree(csrf.getResponse().getContentAsString()).get("token").asText();
        for(int i=0;i<2;i++)mvc.perform(post("/api/transfers").cookie(cookie).header("X-CSRF-TOKEN",token).contentType(MediaType.APPLICATION_JSON)
                .content("{\"sourceAccountId\":1,\"targetAccountId\":2,\"amount\":\"1.00\"}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/transfers").cookie(cookie).header("X-CSRF-TOKEN",token).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After")).andExpect(jsonPath("$.fieldErrors").isArray());
    }
}
