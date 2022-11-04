# from django.db import models
from pathlib import Path
import json

class PDGParticles:
    
    def __init__(self):
        filename = Path(__file__).resolve().parent / 'data/pdg_table.json'
        with open(filename) as f:
            self.PDG = json.load(f)
        self.nameMap = {}
        for p in self.PDG['particles']:
            self.nameMap[p['pdg']] = p
        # print(self.nameMap)
    
    def all(self):
        return self.PDG['particles']
    
    def particles(self):
        return [x for x in self.PDG['particles'] if x['pdg']>0]
    
    def decays(self, pdg):
        return self.nameMap[pdg]['decay']
