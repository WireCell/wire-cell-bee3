#!/usr/bin/env python
from sorcery import dict_of

PDG = {
    'particles' : []
}

def read():
    with open('pdg_table.txt') as f:
        while True:
            p = {}
            line = f.readline()
            if not line: break
            if (line.startswith('#')): continue
            larr = line.split()
            # print(larr)
            name, pdg = larr[1:3]
            pdg = int(pdg)
            if pdg<0:
                p = dict_of(name,pdg)
            else:
                class_name, charge, mass, width, isospen, i3, spin, flavor, trkcod, n_decay = larr[5:]
                charge = int(charge)
                mass = float(mass)
                width = float(width)
                n_decay = int(n_decay)
                p = dict_of(name, pdg, class_name, charge, mass, width, n_decay)
                if n_decay>0:
                    p['decay'] = []
                    # read decay channels
                    for i in range(3): _ = f.readline() # skip 3 lines
                    for i in range(n_decay):
                        decay_line = f.readline().split()
                        decay_type, br, nd = decay_line[1:4]
                        br = float(br)
                        nd = int(nd)
                        ds = [int(x) for x in decay_line[4:4+nd]]
                        p['decay'].append( dict_of(br, nd, ds) )
                    
            PDG['particles'].append(p)
    
def write():
    import json
    with open('pdg_table.json', 'w') as f:
        json.dump(PDG, f)
    


    

if __name__ == '__main__':
    read()
    write()