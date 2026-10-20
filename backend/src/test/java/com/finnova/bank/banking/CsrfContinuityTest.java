package com.finnova.bank.banking;

import java.util.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockCookie;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

@SpringBootTest @AutoConfigureMockMvc(print=MockMvcPrint.NONE)
@ActiveProfiles("dbtest") @Transactional
class CsrfContinuityTest {
    private static final String PASSWORD="Continuity_Test9!Password";
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired JdbcTemplate jdbc;
    // Model browser response cookies, including Max-Age=0 deletions. Manually
    // resending an already-deleted cookie would incorrectly hide this regression.
    private final Map<String,Cookie> jar=new LinkedHashMap<>();

    @Test void samePostLoginCsrfSurvivesProtectedReadsAndSequentialMutationsButLogoutRotatesIt()throws Exception{
        registerAndLogin();
        assertFalse(jar.containsKey("FN_CSRF"),"Login must clear the pre-login CSRF cookie");
        String token=token();
        request(get("/api/profile"),200);
        assertRetained(token);
        JsonNode opened=request(post("/api/accounts").header("X-CSRF-TOKEN",token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"CSRF sequence fixture\",\"accountType\":\"SAVINGS\"}"),201);
        long account=opened.get("id").asLong();
        assertRetained(token);
        JsonNode renamed=request(patch("/api/accounts/"+account).header("X-CSRF-TOKEN",token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"CSRF sequence renamed\"}"),200);
        assertEquals("CSRF sequence renamed",renamed.get("nickname").asText());
        assertRetained(token);
        // Validation is still enforced; do NOT exempt PATCH or disable CsrfFilter.
        request(patch("/api/accounts/"+account).header("X-CSRF-TOKEN","wrong-token")
                .contentType(MediaType.APPLICATION_JSON).content("{\"nickname\":\"Must not apply\"}"),403);
        assertRetained(token);
        JsonNode closed=request(post("/api/accounts/"+account+"/close").header("X-CSRF-TOKEN",token),200);
        assertEquals("CLOSED",closed.get("status").asText());
        assertRetained(token);
        request(post("/api/auth/logout").header("X-CSRF-TOKEN",token),204);
        assertFalse(jar.containsKey("FN_CSRF"));assertFalse(jar.containsKey("FN_ACCESS"));
        request(get("/api/profile"),401);
        assertFalse(jar.containsKey("JSESSIONID"));
    }

    @Test void passwordChangeStillClearsCsrfAndAccessCookies()throws Exception{
        registerAndLogin();String token=token();
        request(get("/api/profile"),200);assertRetained(token);
        String body=mapper.writeValueAsString(Map.of("currentPassword",PASSWORD,"newPassword","Changed_Continuity9!Password"));
        request(post("/api/auth/password").header("X-CSRF-TOKEN",token).contentType(MediaType.APPLICATION_JSON).content(body),204);
        assertFalse(jar.containsKey("FN_CSRF"));assertFalse(jar.containsKey("FN_ACCESS"));
        request(get("/api/profile"),401);
    }

    private void registerAndLogin()throws Exception{
        assertEquals("finnova_test",jdbc.queryForObject("SELECT DATABASE()",String.class));
        String email="csrf-continuity-"+UUID.randomUUID()+"@finnova.test";
        String token=token();
        String registration=mapper.writeValueAsString(Map.of("email",email,"fullName","Synthetic CSRF Fixture",
                "password",PASSWORD,"dateOfBirth","1995-01-01","declaredMonthlyIncome","35000.00"));
        request(post("/api/auth/register").header("X-CSRF-TOKEN",token).contentType(MediaType.APPLICATION_JSON).content(registration),201);
        String login=mapper.writeValueAsString(Map.of("email",email,"password",PASSWORD));
        request(post("/api/auth/login").header("X-CSRF-TOKEN",token).contentType(MediaType.APPLICATION_JSON).content(login),200);
        assertTrue(jar.containsKey("FN_ACCESS"));
    }
    private String token()throws Exception{
        JsonNode response=request(get("/api/auth/csrf"),200);
        String value=response.get("token").asText();assertRetained(value);return value;
    }
    private void assertRetained(String expected){
        assertTrue(jar.containsKey("FN_CSRF"),"Ordinary JWT requests must not delete the CSRF cookie");
        // Boolean assertion avoids printing token values if this check fails.
        assertTrue(expected.equals(jar.get("FN_CSRF").getValue()),"CSRF cookie unexpectedly changed");
    }
    private JsonNode request(MockHttpServletRequestBuilder builder,int expected)throws Exception{
        if(!jar.isEmpty())builder.cookie(jar.values().toArray(Cookie[]::new));
        MvcResult result=mvc.perform(builder).andReturn();
        assertEquals(expected,result.getResponse().getStatus(),"Unexpected status; no cookie/token/body dump is printed");
        for(String header:result.getResponse().getHeaders("Set-Cookie")){
            MockCookie cookie=MockCookie.parse(header);
            if(cookie.getMaxAge()==0 || cookie.getValue().isEmpty())jar.remove(cookie.getName());
            else jar.put(cookie.getName(),cookie);
        }
        assertNull(result.getRequest().getSession(false),"The JWT API must not create an HttpSession");
        String body=result.getResponse().getContentAsString();
        return body.isBlank()?null:mapper.readTree(body);
    }
}
