from django import template

register = template.Library()

@register.filter
def filename(value):
    """Extract filename from a file path"""
    if value:
        return value.split('/')[-1]
    return value
