import { Box } from "@mui/material";
import { DropzoneArea } from "mui-file-dropzone";
import { useCallback, useState } from "react";


interface FileDropProps {
    text?: string;
    errorMessage: string | undefined;
    fileLimit: number;
    onChange: (files: File[]) => void;
    onDropRejected?: () => void;
}


const FileDrop = (props: FileDropProps) => {

    const [showError] = useState(props.errorMessage !== undefined);

 
    
    const onChange = useCallback((files: File[]) => {
        console.log('files[0].name', files[0]);
        props.onChange(files);
    },[props]);

    console.log('FileDrop Refreshing...', props);
    // console.log('showError', showError);
    // console.log('errorMessage', errorMessage);

    return (
        <>
            {props.text && (<p>{props.text}</p>)}
            <Box component="section" sx={{ maxWidth: 400 }}>
                {!showError && (
                    <DropzoneArea dropzoneClass="drop_zone" filesLimit={props.fileLimit} showPreviews={false} showPreviewsInDropzone={true} useChipsForPreview={true} 
                        showAlerts={false} dropzoneText={''} onDropRejected={props.onDropRejected} onChange={onChange} />
                    ) 
                }
            </Box>
        </>
    );
};

export default FileDrop;
