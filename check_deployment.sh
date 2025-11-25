#!/bin/bash

# GuffGaff Production Deployment Checklist Script
# This script helps verify your deployment configuration

echo "=========================================="
echo "GuffGaff Production Deployment Checklist"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Function to check environment variable
check_env() {
    local var_name=$1
    local var_value=$(grep "^${var_name}=" .env 2>/dev/null | cut -d '=' -f2-)
    
    if [ -z "$var_value" ] || [ "$var_value" == "your-secret-key-here-change-this-in-production" ]; then
        echo -e "${RED}✗${NC} $var_name is not set or using default value"
        ((ERRORS++))
        return 1
    else
        echo -e "${GREEN}✓${NC} $var_name is configured"
        return 0
    fi
}

# Function to check optional environment variable
check_optional_env() {
    local var_name=$1
    local var_value=$(grep "^${var_name}=" .env 2>/dev/null | cut -d '=' -f2-)
    
    if [ -z "$var_value" ]; then
        echo -e "${YELLOW}⚠${NC} $var_name is not set (optional)"
        ((WARNINGS++))
        return 1
    else
        echo -e "${GREEN}✓${NC} $var_name is configured"
        return 0
    fi
}

echo "1. Checking .env file exists..."
if [ ! -f .env ]; then
    echo -e "${RED}✗${NC} .env file not found! Copy .env.example to .env first."
    echo "   Run: cp .env.example .env"
    exit 1
else
    echo -e "${GREEN}✓${NC} .env file exists"
fi

echo ""
echo "2. Checking critical settings..."
check_env "SECRET_KEY"
check_env "DEBUG"
check_env "ALLOWED_HOSTS"

echo ""
echo "3. Checking DEBUG setting..."
DEBUG_VALUE=$(grep "^DEBUG=" .env | cut -d '=' -f2)
if [ "$DEBUG_VALUE" == "False" ]; then
    echo -e "${GREEN}✓${NC} DEBUG is set to False (production mode)"
else
    echo -e "${YELLOW}⚠${NC} DEBUG is set to True (development mode)"
    echo "   For production, set DEBUG=False in .env"
    ((WARNINGS++))
fi

echo ""
echo "4. Checking HTTPS/Security settings..."
if [ "$DEBUG_VALUE" == "False" ]; then
    check_env "CSRF_TRUSTED_ORIGINS"
    
    CSRF_VALUE=$(grep "^CSRF_TRUSTED_ORIGINS=" .env | cut -d '=' -f2-)
    if [[ $CSRF_VALUE == https://* ]]; then
        echo -e "${GREEN}✓${NC} CSRF_TRUSTED_ORIGINS includes HTTPS"
    else
        echo -e "${YELLOW}⚠${NC} CSRF_TRUSTED_ORIGINS should include https:// URLs for production"
        ((WARNINGS++))
    fi
fi

echo ""
echo "5. Checking Redis configuration..."
check_env "REDIS_HOST"
check_env "REDIS_PORT"

echo ""
echo "6. Checking email configuration (optional)..."
check_optional_env "EMAIL_BACKEND"
check_optional_env "EMAIL_HOST"

echo ""
echo "7. Checking for default SECRET_KEY..."
SECRET_VALUE=$(grep "^SECRET_KEY=" .env | cut -d '=' -f2-)
if [ "$SECRET_VALUE" == "your-secret-key-here-change-this-in-production" ] || [ "$SECRET_VALUE" == "django-insecure-8=7+^0d=)2te1xw(=fz)dj!g8$=3o11*oplyo%uc72*5h_^sc=" ]; then
    echo -e "${RED}✗${NC} You are using the default SECRET_KEY!"
    echo "   Generate a new one with:"
    echo "   python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'"
    ((ERRORS++))
else
    echo -e "${GREEN}✓${NC} SECRET_KEY has been changed from default"
fi

echo ""
echo "8. Running Django deployment check..."
if command -v docker-compose &> /dev/null; then
    echo "Running: docker-compose exec web python manage.py check --deploy"
    docker-compose exec web python manage.py check --deploy 2>&1 | grep -v "CommandError" || true
else
    echo "Docker not running. Skipping Django check."
fi

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo -e "Errors: ${RED}${ERRORS}${NC}"
echo -e "Warnings: ${YELLOW}${WARNINGS}${NC}"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}⚠ Please fix the errors above before deploying to production!${NC}"
    exit 1
elif [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠ Please review the warnings above.${NC}"
    exit 0
else
    echo -e "${GREEN}✓ All checks passed! Your configuration looks good.${NC}"
    exit 0
fi
