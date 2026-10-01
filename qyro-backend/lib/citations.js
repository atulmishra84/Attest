const CITATIONS = {
  'C-001': [
    { framework: 'HIPAA', citation: '164.312(a)(1)', title: 'Access control' },
    { framework: 'NIST AI RMF', citation: 'GOVERN 1.2', title: 'Risk accountability' },
    { framework: 'OWASP LLM', citation: 'LLM02', title: 'Sensitive information disclosure' },
  ],
  'C-002': [
    { framework: 'HIPAA', citation: '164.312(c)(1)', title: 'Integrity' },
    { framework: 'NIST AI RMF', citation: 'MEASURE 2.7', title: 'Security and resilience' },
  ],
  'C-003': [
    { framework: 'NIST AI RMF', citation: 'MANAGE 2.2', title: 'Least-privilege mechanisms' },
    { framework: 'OWASP LLM', citation: 'LLM06', title: 'Excessive agency' },
  ],
  'C-004': [
    { framework: 'NIST AI RMF', citation: 'MANAGE 1.3', title: 'Response to identified risks' },
    { framework: 'OWASP LLM', citation: 'LLM06', title: 'Excessive agency' },
  ],
};

function citationsFor(controlId) {
  return CITATIONS[controlId] || [];
}

function citationLabel(controlId) {
  return citationsFor(controlId)
    .map((item) => `${item.framework} ${item.citation}`)
    .join('; ');
}

module.exports = { CITATIONS, citationsFor, citationLabel };
