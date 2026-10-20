package com.finnova.bank.auth;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.auth.repository.UserRepository;
import com.finnova.bank.auth.service.AuthService;
import com.finnova.bank.security.*;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.security.test.web.servlet.response.SecurityMockMvcResultMatchers.unauthenticated;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc(print = org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint.NONE) @ActiveProfiles("dbtest") @Transactional
@Import(AuthSecurityTest.Probes.class)
class AuthSecurityTest {
    private static final String PASSWORD = "Synthetic_Test9!Secret";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired EntityManager entityManager;
    @Autowired AuthService auth;
    @Autowired JwtEncoder jwtEncoder;
    @Autowired SecurityProperties properties;
    record Customer(long id, String email) { }
    @BeforeEach void requireIsolatedSchema() {
        assertEquals("finnova_test", jdbc.queryForObject("SELECT DATABASE()", String.class));
        assertTrue(jdbc.queryForObject("SELECT CURRENT_USER()", String.class).startsWith("finnova_app@"));
    }
    @Test void registersOnlyACustomerWithBcryptProfileKycAndAuditButNoAccountMoney() throws Exception {
        Customer customer = customer();
        var user = users.findById(customer.id()).orElseThrow();
        assertEquals(Role.CUSTOMER, user.getRole());
        assertTrue(user.isEnabled());
        assertTrue(encoder.matches(PASSWORD, user.getPasswordHash()));
        assertNotEquals(PASSWORD, user.getPasswordHash());
        assertEquals(1L, jdbc.queryForObject("SELECT COUNT(*) FROM kyc_records k JOIN customers c ON c.id=k.customer_id WHERE c.user_id=? AND k.status='PENDING'", Long.class, customer.id()));
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM accounts a JOIN customers c ON c.id=a.customer_id WHERE c.user_id=?", Long.class, customer.id()));
        assertEquals(1L, auditCount("REGISTRATION", customer.id()));
    }
    @Test void duplicateEmailReturns409WithoutSqlOrStackTrace() throws Exception {
        Customer customer = customer();
        var result = mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(registration(customer.email().toUpperCase()))))
                .andExpect(status().isConflict()).andReturn();
        safeError(result, 409);
    }
    @Test void rejectsWeakPasswordsAndReportsFieldsWithoutEchoingRejectedValues() throws Exception {
        Map<String, Object> body = registration(email()); body.put("password", "short");
        var result = mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fieldErrors[0].field").value("password")).andReturn();
        safeError(result, 400);
        assertFalse(result.getResponse().getContentAsString().contains("short"));
    }
    @Test void rejectsClientControlledRoleAndBalancesInsteadOfMassAssignment() throws Exception {
        Map<String, Object> body = registration(email()); body.put("role", "ADMIN"); body.put("balance", "999999.00");
        var result = mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isBadRequest()).andReturn();
        safeError(result, 400);
    }
    @Test void underageRegistrationReturns422() throws Exception {
        Map<String, Object> body = registration(email()); body.put("dateOfBirth", java.time.LocalDate.now(java.time.ZoneId.of("Asia/Kolkata")).minusYears(10).toString());
        var result = mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(body)))
                .andExpect(status().isUnprocessableEntity()).andReturn();
        safeError(result, 422);
    }
    @Test void realCsrfCookieAndHeaderAreRequiredAndWorkWithoutAnHttpSession() throws Exception {
        Customer customer = customer();
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content(loginJson(customer.email(), PASSWORD)))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.status").value(403));
        MvcResult tokenResponse = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        Cookie csrfCookie = cookie(tokenResponse, "FN_CSRF");
        JsonNode csrfBody = mapper.readTree(tokenResponse.getResponse().getContentAsString());
        var login = mvc.perform(post("/api/auth/login").cookie(csrfCookie)
                .header("X-CSRF-TOKEN", csrfBody.get("token").asText()).contentType(MediaType.APPLICATION_JSON)
                .content(loginJson(customer.email(), PASSWORD))).andExpect(status().isOk()).andReturn();
        assertNull(login.getRequest().getSession(false));
        assertTrue(login.getResponse().getHeaders(HttpHeaders.SET_COOKIE).stream()
                .noneMatch(header -> header.startsWith("JSESSIONID=")));
    }
    @Test void loginIssuesAnHttpOnlyLaxCookieButNeverAJwtInTheJsonBody() throws Exception {
        Customer customer = customer();
        MvcResult result = login(customer.email(), PASSWORD);
        String header = result.getResponse().getHeaders(HttpHeaders.SET_COOKIE).stream()
                .filter(value -> value.startsWith(AuthCookies.ACCESS + "=")).findFirst().orElseThrow();
        assertTrue(header.contains("HttpOnly")); assertTrue(header.contains("SameSite=Lax"));
        assertTrue(header.contains("Path=/api")); assertFalse(header.contains("Domain="));
        JsonNode body = mapper.readTree(result.getResponse().getContentAsString());
        assertFalse(body.has("accessToken")); assertFalse(body.has("passwordHash")); assertFalse(body.has("tokenVersion"));
        mvc.perform(get("/api/profile").cookie(cookie(result, AuthCookies.ACCESS)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(customer.id()));
    }
    @Test void genericLoginFailureUpdatesCountersAndAudit() throws Exception {
        Customer customer = customer();
        MvcResult known = badLogin(customer.email());
        MvcResult unknown = badLogin(email());
        assertEquals(mapper.readTree(known.getResponse().getContentAsString()).get("message"),
                mapper.readTree(unknown.getResponse().getContentAsString()).get("message"));
        assertEquals(1, users.findById(customer.id()).orElseThrow().getFailedLoginAttempts());
        assertEquals(1L, auditCount("LOGIN_FAILURE", customer.id()));
        String details = jdbc.queryForObject("SELECT CAST(details AS CHAR) FROM audit_logs WHERE event_type='LOGIN_FAILURE' AND resource_id=?", String.class, Long.toString(customer.id()));
        assertFalse(details.contains(PASSWORD)); assertFalse(details.contains(customer.email()));
    }
    @Test void thresholdLocksTheAccountAndRevokesAnExistingSession() throws Exception {
        Customer customer = customer(); Cookie old = cookie(login(customer.email(), PASSWORD), AuthCookies.ACCESS);
        for (int i = 0; i < 5; i++) badLogin(customer.email());
        var user = users.findById(customer.id()).orElseThrow();
        assertNotNull(user.getLockedUntil()); assertTrue(user.getLockedUntil().isAfter(Instant.now()));
        assertEquals(1L, auditCount("ACCOUNT_LOCKED", customer.id()));
        mvc.perform(get("/api/profile").cookie(old)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(loginJson(customer.email(), PASSWORD))).andExpect(status().isUnauthorized());
    }
    @Test void disabledSeedIdentityCannotLogin() throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(loginJson("admin@finnova.test", PASSWORD))).andExpect(status().isUnauthorized());
    }
    @Test void logoutRevokesTheCapturedTokenNotJustTheBrowserCookie() throws Exception {
        Customer customer = customer(); Cookie old = cookie(login(customer.email(), PASSWORD), AuthCookies.ACCESS);
        mvc.perform(post("/api/auth/logout").with(csrf()).cookie(old)).andExpect(status().isNoContent());
        mvc.perform(get("/api/profile").cookie(old)).andExpect(status().isUnauthorized());
        assertEquals(1L, auditCount("LOGOUT", customer.id()));
    }
    @Test void passwordChangeRevokesAllOldTokensAndAcceptsOnlyTheNewPassword() throws Exception {
        Customer customer = customer(); Cookie old = cookie(login(customer.email(), PASSWORD), AuthCookies.ACCESS);
        String replacement = "Synthetic_New9!Password";
        mvc.perform(post("/api/auth/password").with(csrf()).cookie(old).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("currentPassword", PASSWORD, "newPassword", replacement))))
                .andExpect(status().isNoContent());
        mvc.perform(get("/api/profile").cookie(old)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(loginJson(customer.email(), PASSWORD))).andExpect(status().isUnauthorized());
        login(customer.email(), replacement);
        assertEquals(1L, auditCount("PASSWORD_CHANGED", customer.id()));
    }
    @Test void profileUpdateIsOwnedAndAuditedAndDoesNotAcceptRole() throws Exception {
        Customer customer = customer(); Cookie access = cookie(login(customer.email(), PASSWORD), AuthCookies.ACCESS);
        mvc.perform(patch("/api/profile").with(csrf()).cookie(access).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Renamed Synthetic Customer\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.fullName").value("Renamed Synthetic Customer"));
        assertEquals(1L, auditCount("PROFILE_CHANGED", customer.id()));
        mvc.perform(patch("/api/profile").with(csrf()).cookie(access).contentType(MediaType.APPLICATION_JSON)
                .content("{\"fullName\":\"Demo\",\"role\":\"ADMIN\"}"))
                .andExpect(status().isBadRequest());
    }
    @Test void serviceOwnershipRejectsAnExplicitDifferentUserId() throws Exception {
        Customer first = customer(); Customer second = customer();
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(new BankPrincipal(first.id(), Role.CUSTOMER), null,
                List.of(new SimpleGrantedAuthority("ROLE_CUSTOMER"))));
        SecurityContextHolder.setContext(context);
        try { assertThrows(AccessDeniedException.class, () -> auth.profile(second.id())); }
        finally { SecurityContextHolder.clearContext(); }
    }
    @Test void rolesAreEnforcedByPreAuthorizeUsingCurrentDatabaseRole() throws Exception {
        Customer customer = customer(); Cookie access = cookie(login(customer.email(), PASSWORD), AuthCookies.ACCESS);
        mvc.perform(get("/api/_test/admin").cookie(access)).andExpect(status().isForbidden());
        mvc.perform(get("/api/_test/officer").cookie(access)).andExpect(status().isForbidden());
        entityManager.flush(); entityManager.clear();
        jdbc.update("UPDATE users SET role='LOAN_OFFICER',approval_limit=500000.00 WHERE id=?", customer.id());
        mvc.perform(get("/api/_test/officer").cookie(access)).andExpect(status().isOk());
        mvc.perform(get("/api/_test/admin").cookie(access)).andExpect(status().isForbidden());
        entityManager.clear();
        jdbc.update("UPDATE users SET role='ADMIN' WHERE id=?", customer.id());
        mvc.perform(get("/api/_test/admin").cookie(access)).andExpect(status().isOk());
    }
    @Test void rejectsMalformedExpiredWrongAudienceAndTamperedTokens() throws Exception {
        Customer customer = customer();
        Cookie valid = cookie(login(customer.email(), PASSWORD), AuthCookies.ACCESS);
        for (String invalid : List.of("not-a-token", signed(customer.id(), "wrong-audience", Instant.now().plusSeconds(300)),
                signed(customer.id(), properties.audience(), Instant.now().minusSeconds(120)),
                valid.getValue().substring(0, valid.getValue().lastIndexOf('.') + 1) + "X".repeat(43))) {
            mvc.perform(get("/api/profile").cookie(new Cookie(AuthCookies.ACCESS, invalid)))
                    .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.fieldErrors").isArray());
        }
    }
    @Test void anonymousAndHeaderOnlyRequestsCannotReadPrivateProfiles() throws Exception {
        Customer customer = customer(); Cookie access = cookie(login(customer.email(), PASSWORD), AuthCookies.ACCESS);
        mvc.perform(get("/api/profile")).andExpect(status().isUnauthorized()).andExpect(unauthenticated());
        mvc.perform(get("/api/profile").header("Authorization", "Bearer " + access.getValue())).andExpect(status().isUnauthorized());
    }
    @Test void deactivationTakesEffectOnTheNextAuthenticatedRequest() throws Exception {
        Customer customer = customer(); Cookie access = cookie(login(customer.email(), PASSWORD), AuthCookies.ACCESS);
        entityManager.flush(); entityManager.clear();
        jdbc.update("UPDATE users SET enabled=FALSE WHERE id=?", customer.id());
        mvc.perform(get("/api/profile").cookie(access)).andExpect(status().isUnauthorized());
    }
    @Test void corsAllowsOnlyConfiguredOriginsAndSafeErrorsCover403404500() throws Exception {
        mvc.perform(options("/api/auth/login").header("Origin", "http://127.0.0.1:5173")
                .header("Access-Control-Request-Method", "POST").header("Access-Control-Request-Headers", "Content-Type,X-CSRF-TOKEN"))
                .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://127.0.0.1:5173"))
                .andExpect(header().string("Access-Control-Allow-Credentials", "true"));
        safeError(mvc.perform(get("/api/health").header("Origin", "https://untrusted.invalid"))
                .andExpect(status().isForbidden()).andReturn(), 403);
        Customer customer = customer(); Cookie access = cookie(login(customer.email(), PASSWORD), AuthCookies.ACCESS);
        safeError(mvc.perform(get("/api/missing-resource").cookie(access)).andExpect(status().isNotFound()).andReturn(), 404);
        safeError(mvc.perform(get("/api/_test/error").cookie(access)).andExpect(status().isInternalServerError()).andReturn(), 500);
    }
    // Obtain real CSRF cookies/headers; do not replace the configured repository
    // with Spring Security Test's session-backed csrf() postprocessor.
    private org.springframework.test.web.servlet.request.RequestPostProcessor csrf() throws Exception {
        MvcResult result = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
        Cookie tokenCookie = cookie(result, "FN_CSRF");
        String token = mapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
        return request -> {
            var cookies = new java.util.ArrayList<Cookie>();
            if (request.getCookies() != null) cookies.addAll(java.util.Arrays.asList(request.getCookies()));
            cookies.removeIf(value -> "FN_CSRF".equals(value.getName()));
            cookies.add(tokenCookie);
            request.setCookies(cookies.toArray(Cookie[]::new));
            request.addHeader("X-CSRF-TOKEN", token);
            return request;
        };
    }
    private Customer customer() throws Exception {
        String email = email();
        MvcResult result = mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(registration(email))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.passwordHash").doesNotExist()).andReturn();
        return new Customer(mapper.readTree(result.getResponse().getContentAsString()).get("id").asLong(), email);
    }
    private Map<String, Object> registration(String email) {
        Map<String, Object> value = new java.util.HashMap<>();
        value.put("email", email); value.put("fullName", "Synthetic Test Customer"); value.put("password", PASSWORD);
        value.put("dateOfBirth", "1995-01-01"); value.put("declaredMonthlyIncome", "35000.00");
        return value;
    }
    private String email() { return "auth-" + UUID.randomUUID() + "@finnova.test"; }
    private String loginJson(String email, String password) throws Exception { return mapper.writeValueAsString(Map.of("email", email, "password", password)); }
    private MvcResult login(String email, String password) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(loginJson(email, password)))
                .andExpect(status().isOk()).andReturn();
    }
    private MvcResult badLogin(String email) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(loginJson(email, "Wrong_Synthetic9!Password")))
                .andExpect(status().isUnauthorized()).andReturn();
    }
    private long auditCount(String event, long userId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM audit_logs WHERE event_type=? AND resource_id=?", Long.class, event, Long.toString(userId));
    }
    private Cookie cookie(MvcResult result, String name) {
        String header = result.getResponse().getHeaders(HttpHeaders.SET_COOKIE).stream()
                .filter(value -> value.startsWith(name + "=")).findFirst().orElseThrow();
        return new Cookie(name, header.substring(name.length() + 1, header.indexOf(';')));
    }
    private String signed(long id, String audience, Instant expiration) {
        JwtClaimsSet claims = JwtClaimsSet.builder().issuer(properties.issuer()).subject(Long.toString(id))
                .audience(List.of(audience)).issuedAt(Instant.now().minusSeconds(300)).expiresAt(expiration)
                .id(UUID.randomUUID().toString()).claim("ver", 0L).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();
    }
    private void safeError(MvcResult result, int expected) throws Exception {
        JsonNode error = mapper.readTree(result.getResponse().getContentAsString());
        assertEquals(expected, error.get("status").asInt());
        for (String field : List.of("timestamp", "error", "message", "path", "fieldErrors")) assertTrue(error.has(field));
        assertFalse(error.has("trace")); assertFalse(error.has("exception"));
        assertFalse(result.getResponse().getContentAsString().contains("SELECT "));
        assertFalse(result.getResponse().getContentAsString().contains("password_hash"));
    }
    @TestConfiguration static class Probes {
        @Bean com.finnova.testsupport.SecurityProbeController stage3TestOnlyController() {
            return new com.finnova.testsupport.SecurityProbeController();
        }
    }
}
