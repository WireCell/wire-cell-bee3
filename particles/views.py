from django.shortcuts import render, HttpResponse
from django.core import serializers

# Create your views here.
from .models import PDGParticles
# from django.conf import settings
import json


def particle_list(request):
    particles = PDGParticles().particles()

    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return HttpResponse(serializers.serialize("json", particles))
    else:
        return render(request, 'particles/list.html', {
            'particles': particles,
        })

def decay_list(request, pdg):
    db = PDGParticles()
    name = db.nameMap[pdg]['name']
    decays = db.decays(pdg)
    for decay in decays:
        codes =  decay['ds']
        names = [db.nameMap[x]['name'] for x in codes]
        formula = f'({name}) -> '
        for i in range(len(codes)):
            if i==0: 
                formula += f'({names[i]})'
            else:
                formula += f' + ({names[i]})'
        decay['formula'] = formula

    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return HttpResponse(serializers.serialize("json", particles))
    else:
        return render(request, 'particles/decays.html', {
            'pdg': pdg,
            'name': name,
            'decays': decays,
        })

def details(request, pdg):
    db = PDGParticles()
    particle = db.one(pdg)
    if not particle:
        return HttpResponse(f'particle with pdg code {pdg} does not exist.')
    return render(request, 'particles/details.html', {
        'particle': particle,
    })