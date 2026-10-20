package com.finnova.bank.loans;
import com.finnova.bank.auth.domain.*;
import com.finnova.bank.auth.repository.*;
import com.finnova.bank.banking.BankingAccess;
import com.finnova.bank.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
@Service
public class LoanAccess {
    private final UserRepository users;private final CustomerRepository customers;private final BankingAccess access;
    public LoanAccess(UserRepository users,CustomerRepository customers,BankingAccess access){this.users=users;this.customers=customers;this.access=access;}
    public Role readActor(long user){return access.actor(user);}
    public BankUser holdActor(long user){BankUser actor=users.shareById(user).orElseThrow(()->new ApiException(HttpStatus.UNAUTHORIZED,"Invalid session."));access.actor(user);return actor;}
    public CustomerProfile customer(long user,boolean write){if(write)holdActor(user);return customers.findByUserId(user).filter(c->access.actor(user)==Role.CUSTOMER).orElseThrow(()->new ApiException(HttpStatus.FORBIDDEN,"Customer role and profile required."));}
    public void readable(long user,long customer){Role role=readActor(user);if(role==Role.CUSTOMER && customer(user,false).getId()!=customer)throw missing();}
    public BankUser staff(long user){BankUser actor=holdActor(user);Role role=access.actor(user);if(role!=Role.ADMIN&&role!=Role.LOAN_OFFICER)throw new ApiException(HttpStatus.FORBIDDEN,"Loan staff role required.");return actor;}
    public CustomerProfile owner(long customer){return customers.findById(customer).orElseThrow(this::missing);}
    public void noSelfDecision(long actor,long customer){if(owner(customer).getUserId()==actor)throw new ApiException(HttpStatus.FORBIDDEN,"You cannot review or decide your own application.");}
    public ApiException missing(){return new ApiException(HttpStatus.NOT_FOUND,"Loan resource not found.");}
}
