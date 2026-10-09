import local from './local';
import parent from '../parent';
import alias from '@/alias';
import nestedHash from '#shared/path';
import hash from '#shared';
import pulse from '@pulse/core';
import React from 'react';
import fs from 'node:fs';

export const values = [local, parent, alias, hash, nestedHash, pulse, React, fs];
