type ToolPropertyType = 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object'

interface JsonSchemaProperty {
  type: ToolPropertyType
  description?: string
  enum?: unknown[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  additionalProperties?: boolean
}

interface ToolJsonSchema {
  type: 'function'
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, JsonSchemaProperty>
    required: string[]
    additionalProperties: false
  }
  strict: boolean
}

export class ToolDescription {
  private readonly properties: Record<string, JsonSchemaProperty> = {}
  private readonly requiredProperties: string[] = []

  constructor(
    private readonly toolName: string,
    private readonly toolDescription: string,
    private readonly isStrict: boolean = true
  ) {
    if (!toolName.trim()) {
      throw new Error('Tool name is required')
    }

    if (!toolDescription.trim()) {
      throw new Error('Tool description is required')
    }
  }

  addProperty(name: string, property: JsonSchemaProperty, required: boolean = false): this {
    if (!name.trim()) {
      throw new Error('Property name is required')
    }

    this.properties[name] = property

    if (required && !this.requiredProperties.includes(name)) {
      this.requiredProperties.push(name)
    }

    return this
  }

  addStringProperty(name: string, description?: string, required: boolean = false): this {
    return this.addProperty(
      name,
      {
        type: 'string',
        ...(description && { description })
      },
      required
    )
  }

  addIntegerProperty(name: string, description?: string, required: boolean = false): this {
    return this.addProperty(
      name,
      {
        type: 'integer',
        ...(description && { description })
      },
      required
    )
  }

  addNumberProperty(name: string, description?: string, required: boolean = false): this {
    return this.addProperty(
      name,
      {
        type: 'number',
        ...(description && { description })
      },
      required
    )
  }

  addBooleanProperty(name: string, description?: string, required: boolean = false): this {
    return this.addProperty(
      name,
      {
        type: 'boolean',
        ...(description && { description })
      },
      required
    )
  }

  addEnumProperty(
    name: string,
    values: string[],
    description?: string,
    required: boolean = false
  ): this {
    return this.addProperty(
      name,
      {
        type: 'string',
        enum: values,
        ...(description && { description })
      },
      required
    )
  }

  addArrayProperty(
    name: string,
    itemSchema: JsonSchemaProperty,
    description?: string,
    required: boolean = false
  ): this {
    return this.addProperty(
      name,
      {
        type: 'array',
        items: itemSchema,
        ...(description && { description })
      },
      required
    )
  }

  addObjectProperty(
    name: string,
    properties: JsonSchemaProperty,
    requiredFields: string[] = [],
    description?: string,
    required: boolean = false
  ): this {
    return this.addProperty(
      name,
      {
        ...properties,
        required: requiredFields,
        additionalProperties: false,
        ...(description && { description })
      },
      required
    )
  }

  getToolSchema(): ToolJsonSchema {
    return {
      type: 'function',
      name: this.toolName,
      description: this.toolDescription,
      parameters: {
        type: 'object',
        properties: this.properties,
        required: this.requiredProperties,
        additionalProperties: false
      },
      strict: this.isStrict
    }
  }

  toJSON(): ToolJsonSchema {
    return this.getToolSchema()
  }
}
