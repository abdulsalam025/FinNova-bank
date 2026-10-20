package com.finnova.bank.database;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@ActiveProfiles("dbtest")
@Transactional
class DatabaseMigrationTest {

    @Autowired
    private JdbcTemplate jdbc;

    @BeforeEach
    void refuseToWriteOutsideTheTestSchemaOrAsAPrivilegedUser() {
        assertEquals("finnova_test", jdbc.queryForObject("SELECT DATABASE()", String.class),
                "STOP: tests must never write to the demo schema");
        assertTrue(jdbc.queryForObject("SELECT CURRENT_USER()", String.class).startsWith("finnova_app@"),
                "STOP: tests must exercise the restricted runtime database user");
    }

    @Test
    void createsAllFourteenMvpTablesWithFiveSuccessfulMigrationsAndNoFloatingPointColumns() {
        Set<String> expected = Set.of("users", "customers", "accounts", "transactions", "loan_products",
                "loan_applications", "loan_application_history", "loans", "installments", "payments",
                "kyc_records", "audit_logs", "idempotency_keys", "system_settings");
        Set<String> actual = new HashSet<>(jdbc.queryForList("""
                SELECT TABLE_NAME FROM information_schema.TABLES
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'
                AND TABLE_NAME<>'flyway_schema_history'
                """, String.class));
        assertEquals(expected, actual);
        assertEquals(5L, jdbc.queryForObject("""
                SELECT COUNT(*) FROM flyway_schema_history
                WHERE success=1 AND version IN ('1','2','3','4','5')
                """, Long.class));
        assertEquals(0L, jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA=DATABASE() AND DATA_TYPE IN ('float','double')
                """, Long.class));
    }

    @Test
    void seedsCoherentSyntheticBalancesButNoUsableCredentialsOrPrematureLoans() {
        assertEquals(4L, jdbc.queryForObject("""
                SELECT COUNT(*) FROM users
                WHERE id BETWEEN 1001 AND 1004 AND enabled=FALSE AND password_hash IS NULL
                """, Long.class));
        assertEquals(3L, jdbc.queryForObject("SELECT COUNT(*) FROM loan_products", Long.class));
        BigDecimal total = jdbc.queryForObject("SELECT SUM(balance) FROM accounts WHERE id BETWEEN 1001 AND 1004", BigDecimal.class);
        assertNotNull(total);
        assertEquals(0, new BigDecimal("140000.00").compareTo(total));
        assertEquals(0L, jdbc.queryForObject("""
                SELECT COUNT(*) FROM accounts a LEFT JOIN
                (SELECT account_id,SUM(CASE WHEN direction='CREDIT' THEN amount ELSE -amount END) AS amount
                 FROM transactions GROUP BY account_id) t ON t.account_id=a.id
                WHERE a.balance<>COALESCE(t.amount,0.00)
                """, Long.class));
        // Seed applications 1001..1003 must remain undisbursed fixtures. Separate
        // committed loan-test histories are retained, not deleted as cleanup.
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM loans WHERE loan_application_id BETWEEN 1001 AND 1003", Long.class));
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM installments i JOIN loans l ON l.id=i.loan_id WHERE l.loan_application_id BETWEEN 1001 AND 1003", Long.class));
        assertEquals(0L, jdbc.queryForObject("SELECT COUNT(*) FROM payments p JOIN loans l ON l.id=p.loan_id WHERE l.loan_application_id BETWEEN 1001 AND 1003", Long.class));
        assertEquals("INR", jdbc.queryForObject("SELECT setting_value FROM system_settings WHERE setting_key='app.currency'", String.class));
        assertEquals("Asia/Kolkata", jdbc.queryForObject("SELECT setting_value FROM system_settings WHERE setting_key='app.time_zone'", String.class));
    }

    @Test
    void rejectsNegativeAccountBalancesUsingAnEnforcedMysqlCheckConstraint() {
        long[] owner = newOwner();
        assertSqlError(3819, () -> jdbc.update("""
                INSERT INTO accounts(customer_id,account_number,nickname,balance)
                VALUES(?,?,?,?)
                """, owner[1], accountNumber(), "Negative-balance test", new BigDecimal("-0.01")));
    }

    @Test
    void enforcesUserOperationAndKeyUniquenessForIdempotency() {
        long[] owner = newOwner();
        String key = UUID.randomUUID().toString();
        String requestHash = "0".repeat(64);
        String sql = "INSERT INTO idempotency_keys(user_id,operation,idempotency_key,request_hash) VALUES(?,?,?,?)";
        jdbc.update(sql, owner[0], "TRANSFER", key, requestHash);
        assertSqlError(1062, () -> jdbc.update(sql, owner[0], "TRANSFER", key, requestHash));
        // The same opaque key in a different operation has an independent scope.
        assertEquals(1, jdbc.update(sql, owner[0], "REPAYMENT", key, requestHash));
    }

    @Test
    void allowsHardDeletingAnUnsubmittedDraftButPreservesSubmittedHistory() {
        long[] owner = newOwner();
        long account = newAccount(owner[1]);
        long draft = newDraft(owner[1], account);
        assertEquals(1, jdbc.update("DELETE FROM loan_applications WHERE id=?", draft));
        long submitted = newDraft(owner[1], account);
        jdbc.update("UPDATE loan_applications SET status='SUBMITTED',submitted_at=UTC_TIMESTAMP(6) WHERE id=?", submitted);
        jdbc.update("""
                INSERT INTO loan_application_history
                (loan_application_id,from_status,to_status,actor_type,actor_user_id,actor_role,notes,occurred_at)
                VALUES(?,'DRAFT','SUBMITTED','USER',?,'CUSTOMER','Synthetic constraint test',UTC_TIMESTAMP(6))
                """, submitted, owner[0]);
        assertSqlError(1451, () -> jdbc.update("DELETE FROM loan_applications WHERE id=?", submitted));
    }

    @Test
    void preventsAnotherCustomersAccountFromBeingSelectedForDisbursement() {
        long[] owner = newOwner();
        // Seed account 1001 belongs to seed customer 1001, not this new owner.
        assertSqlError(1452, () -> newDraft(owner[1], 1001L));
    }

    @Test
    void runtimeGrantsProtectImmutableRowsAndInstallmentAmounts() {
        for (String table : Set.of("transactions", "payments", "audit_logs", "loan_application_history")) {
            assertAccessDenied(() -> jdbc.update("UPDATE " + table + " SET updated_at=updated_at WHERE id=-1"));
            assertAccessDenied(() -> jdbc.update("DELETE FROM " + table + " WHERE id=-1"));
        }
        assertAccessDenied(() -> jdbc.update("UPDATE installments SET principal_amount=principal_amount WHERE id=-1"));
        assertAccessDenied(() -> jdbc.update("DELETE FROM installments WHERE id=-1"));
        assertAccessDenied(() -> jdbc.update("UPDATE loans SET principal=principal WHERE id=-1"));
        // Mutable servicing state remains writable; there is deliberately no matching row.
        assertEquals(0, jdbc.update("UPDATE loans SET outstanding_principal=outstanding_principal WHERE id=-1"));
        assertEquals(0, jdbc.update("UPDATE installments SET status=status WHERE id=-1"));
    }

    private long[] newOwner() {
        long user = insert("INSERT INTO users(email,full_name,role,enabled) VALUES(?,?,'CUSTOMER',FALSE)",
                "fixture-" + UUID.randomUUID() + "@finnova.test", "Synthetic Test Customer");
        long customer = insert("INSERT INTO customers(user_id,date_of_birth,declared_monthly_income) VALUES(?,'1990-01-01',35000.00)", user);
        return new long[]{user, customer};
    }

    private long newAccount(long customer) {
        return insert("INSERT INTO accounts(customer_id,account_number,nickname,balance) VALUES(?,?,?,0.00)",
                customer, accountNumber(), "Synthetic fixture account");
    }

    private long newDraft(long customer, long account) {
        return insert("""
                INSERT INTO loan_applications(customer_id,loan_product_id,disbursement_account_id,
                product_name_snapshot,principal,annual_rate,tenure_months,declared_monthly_income,purpose)
                VALUES(?,1,?,'Demo Personal Loan',10000.00,12.00,12,35000.00,'Synthetic fixture purpose')
                """, customer, account);
    }

    private String accountNumber() {
        return "FNTEST" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }

    private long insert(String sql, Object... values) {
        KeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < values.length; i++) statement.setObject(i + 1, values[i]);
            return statement;
        }, keys);
        assertNotNull(keys.getKey());
        return keys.getKey().longValue();
    }

    private void assertSqlError(int expected, Runnable operation) {
        DataAccessException failure = assertThrows(DataAccessException.class, operation::run);
        assertEquals(expected, sqlErrorCode(failure), "The expected database rule, not an unrelated SQL failure, must reject the operation");
    }

    private void assertAccessDenied(Runnable operation) {
        DataAccessException failure = assertThrows(DataAccessException.class, operation::run);
        int code = sqlErrorCode(failure);
        assertTrue(code == 1142 || code == 1143, "Expected table/column permission denial, got SQL error " + code);
    }

    private int sqlErrorCode(Throwable failure) {
        for (Throwable current = failure; current != null; current = current.getCause()) {
            if (current instanceof SQLException sql) return sql.getErrorCode();
        }
        throw new AssertionError("Failure did not contain a MySQL SQLException", failure);
    }
}


