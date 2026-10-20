package com.finnova.bank.security;
import java.util.List;
import java.util.UUID;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@SpringBootTest(properties = {"app.security.rate-limit-enabled=true", "app.security.login-requests-per-minute=2"})
@AutoConfigureMockMvc(print = org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE) @ActiveProfiles("dbtest") @Transactional
class RateLimitHttpTest {
    @Autowired MockMvc mvc; @Autowired ObjectMapper mapper; @Autowired JdbcTemplate jdbc;
    @Test void theThirdLoginReturns429AndRetryAfterWithASafeJsonBody() throws Exception {
        assertEquals("finnova_test", jdbc.queryForObject("SELECT DATABASE()", String.class));
        var csrf = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        String header = csrf.getResponse().getHeaders("Set-Cookie").stream().filter(value -> value.startsWith("FN_CSRF=")).findFirst().orElseThrow();
        Cookie cookie = new Cookie("FN_CSRF", header.substring(8, header.indexOf(';')));
        String token = mapper.readTree(csrf.getResponse().getContentAsString()).get("token").asText();
        String body = mapper.writeValueAsString(java.util.Map.of("email", "missing-" + UUID.randomUUID() + "@finnova.test", "password", "Synthetic_Wrong9!Password"));
        for (int i = 0; i < 2; i++) mvc.perform(post("/api/auth/login").cookie(cookie).header("X-CSRF-TOKEN", token).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnauthorized());
        var result = mvc.perform(post("/api/auth/login").cookie(cookie).header("X-CSRF-TOKEN", token).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.fieldErrors").isArray()).andReturn();
        var error = mapper.readTree(result.getResponse().getContentAsString());
        for (String field : List.of("timestamp", "status", "error", "message", "path", "fieldErrors")) assertTrue(error.has(field));
    }
}
