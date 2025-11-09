from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth import authenticate, login as auth_login, logout as auth_logout
from django.contrib.auth.decorators import login_required
from django.db import IntegrityError
from .models import CustomUser


def register(request):
    if request.user.is_authenticated:
        return redirect("login")

    if request.method == 'POST':
        username = request.POST.get("username", "").strip()
        email = request.POST.get("email", "").strip()
        full_name = request.POST.get("fullname", "").strip()
        password = request.POST.get("password", "")
        password2 = request.POST.get("password2", "")

        # Validation
        if not all([username, email, full_name, password, password2]):
            messages.error(request, "All fields are required.")
            return redirect("register")

        if password != password2:
            messages.error(request, "Passwords must match.")
            return redirect("register")

        try:
            CustomUser.objects.create_user(
                username=username,
                email=email,
                full_name=full_name,
                password=password
            )
            messages.success(
                request, "Registration successful! Please log in.")
            return redirect("login")

        except IntegrityError as e:
            messages.error(request, "Username or email already exists.")
            messages.error(request, f"{email} already exits?")
            print(e)
            return redirect("register")

        except Exception as e:
            messages.error(
                request, "An error occurred during registration. Please try again.")
            return redirect("register")

    return render(request, "accounts/register.html")


def login(request):
    if request.user.is_authenticated:
        return redirect("index")

    if request.method == "POST":
        username = request.POST.get("username", "").strip()
        password = request.POST.get("password", "")

        if not username or not password:
            messages.error(request, "Both username and password are required.")
            return redirect("login")

        user = authenticate(request, username=username, password=password)

        if user is not None:
            auth_login(request, user)
            messages.success(request, f"Welcome back, {user.username}!")
            next_url = request.GET.get('next', 'index')
            return redirect(next_url)
        else:
            messages.error(request, "Invalid username or password.")
            return redirect("login")

    return render(request, "accounts/login.html")


@login_required
def logout(request):
    auth_logout(request)
    messages.success(request, "You have been logged out successfully.")
    return redirect("login")
