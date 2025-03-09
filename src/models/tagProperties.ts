export interface TagProperties {
    priority?: number;
    // Add other properties as needed
    description?: string;
    color?: string;
}

export interface EnhancedTag {
    name: string;
    properties: TagProperties;
}
