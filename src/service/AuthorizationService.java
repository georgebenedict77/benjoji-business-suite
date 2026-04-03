package service;

import util.InputValidator;

public class AuthorizationService {
    public String resolvePreparedBy(String preparedBy) {
        return InputValidator.isBlank(preparedBy) ? "System" : preparedBy.trim();
    }

    public String resolveAuthorizedBy(String authorizedBy) {
        return InputValidator.isBlank(authorizedBy) ? "Owner" : authorizedBy.trim();
    }

    public String signaturePlaceholder() {
        return "________________";
    }
}
