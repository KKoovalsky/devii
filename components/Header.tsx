import React from 'react';
import { globals } from '../globals';

export const Header: React.FC = () => (
  <div className="header">
    <a href="/">{globals.siteName}</a>
    <div className="flex-spacer" />
    <a href="https://github.com/KKoovalsky/">GitHub</a>
  </div>
);
