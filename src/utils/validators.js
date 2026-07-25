class Validators {
    static isValidPhoneNumber(phone) {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length >= 10 && cleaned.length <= 13;
    }

    static isValidPixAmount(amount) {
        const numAmount = parseFloat(amount);
        return !isNaN(numAmount) && numAmount >= 5 && numAmount <= 1000;
    }

    static isValidProductName(name) {
        return name && name.length >= 3 && name.length <= 100;
    }

    static isValidPrice(price) {
        const numPrice = parseFloat(price);
        return !isNaN(numPrice) && numPrice > 0 && numPrice <= 9999.99;
    }

    static isValidStock(stock) {
        const numStock = parseInt(stock);
        return !isNaN(numStock) && numStock >= 0 && numStock <= 999999;
    }

    static isValidReferralCode(code) {
        return code && /^DOG\d{4}[A-Z]{4}$/.test(code);
    }

    static isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    static isValidURL(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    static sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        return input
            .replace(/[<>]/g, '') // Remove tags HTML
            .replace(/['"]/g, '') // Remove aspas
            .trim();
    }

    static validatePixData(data) {
        const errors
