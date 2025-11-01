from django.shortcuts import render, redirect
from .models import CustomUser
from django.contrib import messages 
from django.contrib.auth import authenticate, login as auth_login

def index(request):
    return render(request, "chat/index.html")


def room(request, room_name):
    return render(request, "chat/room.html", {"room_name": room_name})



def register(request):
    
    if request.method == 'POST':
    
        username = request.POST.get("username")
        fullname = request.POST.get("fullname")
        password = request.POST.get("password")
        password2 = request.POST.get("password2")
        if password != password2 :
            messages.error(request, "COnfirm passwrod must be match ")
            return redirect("login_page")
            
        try :
            user = CustomUser.objects.create(username=username, full_name=fullname)
            user.set_password(password)
            
            user.save()
            return redirect("login")
        
        
        except Exception as e:
            print(e)
            return redirect("register")
        
    
    return render(request, "chat/register.html")



def login_page(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        
        if user is not None:
            auth_login(request, user)
            messages.success(request, f"Welcome {user.username}!")
            return redirect("index")  # redirect to your chat home or dashboard
        else:
            messages.error(request, "Invalid username or password")
            return redirect("login")
    
    return render(request, "chat/login.html")


    
    
    
    
    