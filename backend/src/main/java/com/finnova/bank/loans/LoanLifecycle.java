package com.finnova.bank.loans;
import com.finnova.bank.auth.domain.Role;
import com.finnova.bank.common.ApiException;
import org.springframework.http.HttpStatus;
public final class LoanLifecycle {
    private LoanLifecycle(){}
    public static void require(ApplicationStatus from,ApplicationStatus to,Role actor){
        boolean customer=actor==Role.CUSTOMER,staff=actor==Role.LOAN_OFFICER||actor==Role.ADMIN,system=actor==null;
        boolean allowed=(customer&&((from==ApplicationStatus.DRAFT&&to==ApplicationStatus.SUBMITTED)
            ||(from==ApplicationStatus.ADDITIONAL_INFO_REQUIRED&&to==ApplicationStatus.UNDER_REVIEW)))
            ||(staff&&((from==ApplicationStatus.SUBMITTED&&to==ApplicationStatus.UNDER_REVIEW)
            ||(from==ApplicationStatus.UNDER_REVIEW&&(to==ApplicationStatus.ADDITIONAL_INFO_REQUIRED||to==ApplicationStatus.APPROVED||to==ApplicationStatus.REJECTED))
            ||(from==ApplicationStatus.APPROVED&&to==ApplicationStatus.DISBURSED)))
            ||(system&&((from==ApplicationStatus.DISBURSED&&to==ApplicationStatus.REPAYMENT)||(from==ApplicationStatus.REPAYMENT&&to==ApplicationStatus.CLOSED)));
        if(!allowed)throw new ApiException(HttpStatus.CONFLICT,"Invalid loan status transition.");
    }
}
