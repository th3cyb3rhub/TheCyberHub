// components/StructuredData.tsx
import React from 'react';

interface StructuredDataProps {
    data: Record<string, unknown>;
}

const StructuredData: React.FC<StructuredDataProps> = ({ data }) => {
    return (
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
                // A `<` is escaped so text from users can never close the script element; the two line
                // separators are valid JSON but end a line in older script parsers, so they are escaped too
                __html: JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
            }}
        />
    );
};

export default StructuredData;