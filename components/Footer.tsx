import React from 'react';
import { globals } from '../globals';

export const Footer: React.FC = () => (
  <div className="footer">
    <p>{`© ${globals.yourName} ${new Date().getFullYear()}`}</p>
  </div>
);
