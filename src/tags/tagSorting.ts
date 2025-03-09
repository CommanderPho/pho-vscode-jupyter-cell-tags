export function sortTagsByPriority(tags: string[], tagMetadata: TagMetadataSource): string[] {
    return [...tags].sort((a, b) => {
        const priorityA = tagMetadata.getPriority(a) || 0;
        const priorityB = tagMetadata.getPriority(b) || 0;
        return priorityB - priorityA;
    });
}
