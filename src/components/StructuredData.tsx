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
                // A `<` is escaped so text from users can never close the script element
                __html: JSON.stringify(data).replace(/</g, '\\u003c')
            }}
        />
    );
};

export default StructuredData;