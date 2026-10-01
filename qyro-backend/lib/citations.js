const CITATIONS = {
  'C-001': [
    { framework: 'HIPAA', citation: '164.312(a)(1)', title: 'Access control' },
    { framework: 'NIST AI RMF', citation: 'GOVERN 1.2', title: 'Risk accountability' },
    { framework: 'EU AI Act', citation: 'Art. 10', title: 'Data and data governance' },
    { framework: 'ISO/IEC 42001', citation: 'A.7', title: 'Data for AI systems' },
    { framework: 'OWASP LLM', citation: 'LLM02', title: 'Sensitive information disclosure' },
    { framework: 'OWASP Agentic 2026', citation: 'ASI03', title: 'Identity and Privilege Abuse' },
  ],
  'C-002': [
    { framework: 'HIPAA', citation: '164.312(c)(1)', title: 'Integrity' },
    { framework: 'NIST AI RMF', citation: 'MEASURE 2.7', title: 'Security and resilience' },
    { framework: 'EU AI Act', citation: 'Art. 15', title: 'Accuracy, robustness and cybersecurity' },
    { framework: 'ISO/IEC 42001', citation: 'A.6', title: 'AI system life cycle' },
    { framework: 'OWASP Agentic 2026', citation: 'ASI02', title: 'Tool Misuse and Exploitation' },
  ],
  'C-003': [
    { framework: 'NIST AI RMF', citation: 'MANAGE 2.2', title: 'Least-privilege mechanisms' },
    { framework: 'EU AI Act', citation: 'Art. 14', title: 'Human oversight' },
    { framework: 'ISO/IEC 42001', citation: 'A.9', title: 'Use of AI systems' },
    { framework: 'OWASP LLM', citation: 'LLM06', title: 'Excessive agency' },
    { framework: 'OWASP Agentic 2026', citation: 'ASI02', title: 'Tool Misuse and Exploitation' },
  ],
  'C-004': [
    { framework: 'NIST AI RMF', citation: 'MANAGE 1.3', title: 'Response to identified risks' },
    { framework: 'EU AI Act', citation: 'Art. 9', title: 'Risk management system' },
    { framework: 'ISO/IEC 42001', citation: 'A.5', title: 'Assessing impacts of AI systems' },
    { framework: 'OWASP LLM', citation: 'LLM06', title: 'Excessive agency' },
    { framework: 'OWASP Agentic 2026', citation: 'ASI08', title: 'Cascading Failures' },
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

function readinessScore(counts) {
  const total = counts.effective + counts.violated + counts.ineffective + counts.other;
  if (!total) return null;
  return Math.round((100 * counts.effective) / total);
}

module.exports = { CITATIONS, citationsFor, citationLabel, readinessScore };
