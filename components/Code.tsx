import React from 'react';
import coy from 'react-syntax-highlighter/dist/cjs/styles/prism/coy';
import prism from 'react-syntax-highlighter/dist/cjs/styles/prism/prism';
import vs from 'react-syntax-highlighter/dist/cjs/styles/prism/vs';
import materiallight from 'react-syntax-highlighter/dist/cjs/styles/prism/material-light';
import { PrismLight, PrismAsyncLight } from "react-syntax-highlighter"

const SyntaxHighlighter =
  typeof window === "undefined" ? PrismLight : PrismAsyncLight

export default class Code extends React.PureComponent<{
  language: string;
  value?: string;
}> {
  render() {
    const { language, value } = this.props;
    var style = coy
    if(language === 'cpp')
        style = prism
    else if(language === 'bash')
        style = vs
    else if(language === 'cmake')
        style = materiallight
    return (
      <SyntaxHighlighter
        language={(language === 'ts' ? 'typescript' : language) || 'typescript'}
        style={style}
      >
        {value}
      </SyntaxHighlighter>
    );
  }
}
