from django import forms
from .models import Message

class MessageFileForm(forms.ModelForm):
    class Meta:
        model = Message
        fields = ['file']
