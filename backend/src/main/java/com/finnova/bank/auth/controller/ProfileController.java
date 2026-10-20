package com.finnova.bank.auth.controller;
import com.finnova.bank.auth.dto.AuthDtos.*;
import com.finnova.bank.auth.service.AuthService;
import com.finnova.bank.security.BankPrincipal;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/profile")
public class ProfileController {
    private final AuthService auth;
    public ProfileController(AuthService auth) { this.auth = auth; }
    @GetMapping public ProfileResponse profile(@AuthenticationPrincipal BankPrincipal principal) { return auth.profile(principal.id()); }
    @PatchMapping public ProfileResponse update(@AuthenticationPrincipal BankPrincipal principal, @Valid @RequestBody UpdateProfileRequest request) {
        return auth.updateProfile(principal.id(), request);
    }
}
