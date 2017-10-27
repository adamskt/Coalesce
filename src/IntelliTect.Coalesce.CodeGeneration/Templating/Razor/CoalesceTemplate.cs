﻿using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;


namespace IntelliTect.Coalesce.CodeGeneration.Templating.Razor
{
    public abstract class CoalesceTemplate
    {
        private TextWriter Output { get; set; }

        public virtual dynamic Model { get; set; }

        public abstract Task ExecuteAsync();

        public async Task<Stream> GetOutputAsync()
        {
            MemoryStream output = new MemoryStream();
            Output = new StreamWriter(output);
            await ExecuteAsync();
            await Output.FlushAsync();
            output.Seek(0, SeekOrigin.Begin);
            return output;
        }

        public void WriteLiteral(object value)
        {
            WriteLiteralTo(Output, value);
        }

        public virtual void WriteLiteralTo(TextWriter writer, object text)
        {
            if (writer == null)
            {
                throw new ArgumentNullException(nameof(writer));
            }

            if (text != null)
            {
                writer.Write(text.ToString());
            }
        }

        public virtual void Write(object value)
        {
            WriteTo(Output, value);
        }

        public virtual void WriteTo(TextWriter writer, object content)
        {
            if (writer == null)
            {
                throw new ArgumentNullException(nameof(writer));
            }

            if (content != null)
            {
                writer.Write(content.ToString());
            }
        }
    }
    public abstract class CoalesceTemplate<TModel> : CoalesceTemplate
    {
        public new TModel Model { get; set; }
    }
}