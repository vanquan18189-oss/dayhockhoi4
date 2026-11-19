# Security Specification for DẠY VÀ HỌC SỐ

## 1. Data Invariants
- A user can only manage their own profile, unless they are admin/teacher.
- Lesson plans, questions, exam matrices, homework assignments, student reports, and activity logs are readable by signed-in users.
- Modifications to core educational assets are allowed for signed-in users (teachers/admins/students creating submissions).

## 2. The 12 Security Test Invariants
1. Block unauthenticated reads and writes.
2. Block invalid document IDs containing control characters or length > 128.
3. Enforce valid key structures on document creation.
4. Validate user profile updates preserve user identity.
5. Protect student reports from unauthorized external modification.
6. Restrict payload sizes to prevent Denial of Wallet.
7. Prevent orphaned submission writes without valid homework assignments.
8. Enforce string length bounds across all user inputs.
9. Ensure activity log writes require non-empty description.
10. Restrict role changes to authorized operations.
11. Prevent null byte injections in text fields.
12. Ensure default-deny for undefined paths.
