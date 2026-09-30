export interface TagProperties {
    priority?: number;
    // Add other properties as needed
    description?: string;
    color?: string;
    /** ISO 8601 timestamp when the tag was first created in this notebook */
    createdAt?: string;
}

export interface EnhancedTag {
    name: string;
    properties: TagProperties;
}
