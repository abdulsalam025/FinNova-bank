package com.finnova.bank.auth.controller;

import com.finnova.bank.auth.dto.AuthDtos.*;
import com.finnova.bank.auth.service.AuthService;
import com.finnova.bank.security.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService auth;
    private final AuthCookies cookies;
    private final CookieCsrfTokenRepository csrf;
    public AuthController(AuthService auth, AuthCookies cookies, CookieCsrfTokenRepository csrf) {
        this.auth = auth; this.cookies = cookies; this.csrf = csrf;
    }
    @GetMapping("/csrf")
    public CsrfResponse csrf(CsrfToken token) { return new CsrfResponse(token.getToken(), token.getHeaderName()); }
    @PostMapping("/register") @ResponseStatus(HttpStatus.CREATED)
    public ProfileResponse register(@Valid @RequestBody RegisterRequest request) { return auth.register(request); }
    @PostMapping("/login")
    public ProfileResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest, HttpServletResponse response) {
        LoginResult result = auth.login(request);
        cookies.set(response, result.accessToken());
        csrf.saveToken(null, httpRequest, response); // Fetch /csrf again after login.
        return result.profile();
    }
    @PostMapping("/logout") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@AuthenticationPrincipal BankPrincipal principal, HttpServletRequest request, HttpServletResponse response) {
        auth.logout(principal.id());
        cookies.clear(response);
        csrf.saveToken(null, request, response);
    }
    @PostMapping("/password") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void password(@AuthenticationPrincipal BankPrincipal principal, @Valid @RequestBody ChangePasswordRequest body,
            HttpServletRequest request, HttpServletResponse response) {
        auth.changePassword(principal.id(), body);
        cookies.clear(response);
        csrf.saveToken(null, request, response);
    }
}
